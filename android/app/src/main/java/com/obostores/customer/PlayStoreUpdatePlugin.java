package com.obostores.customer;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;

/**
 * Google Play In-App Updates (flexible + immediate).
 * Requires app installed from Play Store (or internal testing track) for update flows to work.
 */
@CapacitorPlugin(name = "PlayStoreUpdate")
public class PlayStoreUpdatePlugin extends Plugin {

    private static final int REQUEST_FLEXIBLE = 9101;
    private static final int REQUEST_IMMEDIATE = 9102;

    private AppUpdateManager appUpdateManager;
    private InstallStateUpdatedListener installListener;
    @Nullable
    private PluginCall pendingUpdateCall;

    @Override
    public void load() {
        appUpdateManager = AppUpdateManagerFactory.create(getContext());
        installListener = this::onInstallStateUpdated;
        appUpdateManager.registerListener(installListener);
    }

    @Override
    protected void handleOnDestroy() {
        if (appUpdateManager != null && installListener != null) {
            appUpdateManager.unregisterListener(installListener);
        }
        super.handleOnDestroy();
    }

    private void onInstallStateUpdated(InstallState state) {
        int status = state.installStatus();
        JSObject payload = new JSObject();
        payload.put("installStatus", status);
        payload.put("bytesDownloaded", state.bytesDownloaded());
        payload.put("totalBytesToDownload", state.totalBytesToDownload());

        if (status == InstallStatus.DOWNLOADED) {
            notifyListeners("flexibleUpdateDownloaded", payload);
        } else if (status == InstallStatus.DOWNLOADING) {
            notifyListeners("flexibleUpdateProgress", payload);
        } else if (status == InstallStatus.FAILED || status == InstallStatus.CANCELED) {
            notifyListeners("flexibleUpdateFailed", payload);
        }
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            PackageInfo info = pm.getPackageInfo(pkg, 0);
            JSObject ret = new JSObject();
            ret.put("version", info.versionName != null ? info.versionName : "0.0.0");
            ret.put("build", info.versionCode);
            ret.put("packageId", pkg);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read app version", e);
        }
    }

    @PluginMethod
    public void checkPlayUpdate(PluginCall call) {
        appUpdateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(info -> resolvePlayUpdateInfo(call, info))
            .addOnFailureListener(e -> call.reject(playErrorMessage(e), e));
    }

    @PluginMethod
    public void startFlexibleUpdate(PluginCall call) {
        startUpdateFlow(call, AppUpdateType.FLEXIBLE, REQUEST_FLEXIBLE);
    }

    @PluginMethod
    public void startImmediateUpdate(PluginCall call) {
        startUpdateFlow(call, AppUpdateType.IMMEDIATE, REQUEST_IMMEDIATE);
    }

    @PluginMethod
    public void completeFlexibleUpdate(PluginCall call) {
        try {
            appUpdateManager.completeUpdate();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not complete update", e);
        }
    }

    @PluginMethod
    public void openPlayStore(PluginCall call) {
        String pkg = getContext().getPackageName();
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        try {
            Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg));
            market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(market);
            call.resolve();
        } catch (Exception marketErr) {
            try {
                Intent web = new Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)
                );
                web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(web);
                call.resolve();
            } catch (Exception webErr) {
                call.reject("Play Store is not available", webErr);
            }
        }
    }

    private void startUpdateFlow(PluginCall call, int updateType, int requestCode) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        pendingUpdateCall = call;
        appUpdateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) {
                    rejectPending("No Play Store update available");
                    return;
                }
                if (!info.isUpdateTypeAllowed(updateType)) {
                    rejectPending(
                        updateType == AppUpdateType.IMMEDIATE
                            ? "Immediate update not allowed"
                            : "Flexible update not allowed"
                    );
                    return;
                }
                try {
                    AppUpdateOptions options = AppUpdateOptions.newBuilder(updateType).build();
                    appUpdateManager.startUpdateFlowForResult(info, activity, options, requestCode);
                } catch (IntentSender.SendIntentException e) {
                    rejectPending("Could not start update flow", e);
                }
            })
            .addOnFailureListener(e -> rejectPending(playErrorMessage(e), e));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FLEXIBLE && requestCode != REQUEST_IMMEDIATE) return;
        if (pendingUpdateCall == null) return;

        PluginCall call = pendingUpdateCall;
        pendingUpdateCall = null;

        if (resultCode == Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("accepted", true);
            ret.put("immediate", requestCode == REQUEST_IMMEDIATE);
            call.resolve(ret);
        } else {
            call.reject("Update cancelled by user");
        }
    }

    private void resolvePlayUpdateInfo(PluginCall call, AppUpdateInfo info) {
        JSObject ret = new JSObject();
        boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
        ret.put("updateAvailable", available);
        ret.put("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
        ret.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        ret.put("availableVersionCode", info.availableVersionCode());
        ret.put("installStatus", info.installStatus());
        ret.put("clientVersionStalenessDays", info.clientVersionStalenessDays());
        call.resolve(ret);
    }

    private void rejectPending(String message) {
        rejectPending(message, null);
    }

    private void rejectPending(String message, @Nullable Exception e) {
        if (pendingUpdateCall != null) {
            PluginCall call = pendingUpdateCall;
            pendingUpdateCall = null;
            if (e != null) call.reject(message, e);
            else call.reject(message);
        }
    }

    private static String playErrorMessage(Exception e) {
        String msg = e.getMessage();
        if (msg == null || msg.isEmpty()) return "Play Store update check failed";
        return msg;
    }
}
