package com.obostores.customer;

import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Runtime RECORD_AUDIO permission for voice orders and voice search in the WebView.
 * Google Play: declare microphone use in Data safety + privacy policy.
 */
@CapacitorPlugin(
    name = "MicrophonePermission",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class MicrophonePermissionPlugin extends Plugin {

    private boolean isRecordAudioGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void check(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isRecordAudioGranted());
        call.resolve(ret);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (isRecordAudioGranted()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermsCallback");
    }

    @PermissionCallback
    private void microphonePermsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isRecordAudioGranted());
        call.resolve(ret);
    }
}
