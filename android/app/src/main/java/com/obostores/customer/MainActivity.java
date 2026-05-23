package com.obostores.customer;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Grants WebView audio capture when app-level RECORD_AUDIO is already allowed.
 * Required for MediaRecorder / getUserMedia in the Capacitor WebView on many devices.
 */
public class MainActivity extends BridgeActivity {

    private boolean webChromeHooked = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MicrophonePermissionPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        hookWebChromeForMicrophone();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (!webChromeHooked) {
            hookWebChromeForMicrophone();
        }
    }

    private void hookWebChromeForMicrophone() {
        if (webChromeHooked || getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        WebChromeClient existing = webView.getWebChromeClient();
        if (existing == null) {
            return;
        }

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                                && ContextCompat.checkSelfPermission(
                                        MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                        == PackageManager.PERMISSION_GRANTED) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                            return;
                        }
                    }
                }
                existing.onPermissionRequest(request);
            }
        });
        webChromeHooked = true;
    }
}
