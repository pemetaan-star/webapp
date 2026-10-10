package com.pemetaanstar.lingga;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.graphics.Color;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Base64;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import android.view.ViewGroup;
import android.widget.FrameLayout;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.Set;

public class MainActivity extends ComponentActivity {
    private static final String START_URL = "https://pemetaanlingga.vercel.app/";
    private static final String APP_HOST = "pemetaanlingga.vercel.app";
    private static final String OFFLINE_PAGE = """
            <!doctype html>
            <html lang="id">
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <meta name="theme-color" content="#f4f7fa">
              <title>Lingga Indonesia - Offline</title>
              <style>
                * { box-sizing: border-box; }
                body { min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; margin: 0; padding: 20px; color: #14253d; font-family: Arial, sans-serif; background: radial-gradient(ellipse at 10% 8%, #dcefeb 0, transparent 36%), radial-gradient(ellipse at 94% 90%, #f7e7dd 0, transparent 30%), #f4f7fa; }
                main { width: min(100%, 420px); padding: 34px 30px 26px; text-align: center; border: 1px solid #fff; border-radius: 24px; background: #fffffffa; box-shadow: 0 24px 70px #19314f20; }
                img { display: block; width: 64px; height: 64px; margin: 0 auto 18px; border: 1px solid #e8edf0; border-radius: 17px; box-shadow: 0 8px 20px #19314f16; }
                .status { display: inline-flex; align-items: center; gap: 7px; margin: 0 0 18px; padding: 7px 10px; border: 1px solid #f0ded9; border-radius: 999px; color: #965342; background: #fff8f5; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
                .dot { width: 8px; height: 8px; border-radius: 50%; background: #d46b51; }
                h1 { margin: 0 0 10px; font-size: 23px; letter-spacing: -.04em; }
                p { margin: 0; color: #728092; font-size: 14px; line-height: 1.6; }
                a { position: relative; display: flex; min-height: 46px; align-items: center; justify-content: center; margin-top: 22px; border: 1px solid #164e4a; border-radius: 10px; color: #fff; background: linear-gradient(110deg, #17324a, #12665d); box-shadow: 0 7px 16px #124f482b; font-size: 14px; font-weight: 700; text-decoration: none; }
                a span { position: absolute; right: 14px; font-size: 19px; }
                footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid #edf0f2; color: #748394; font-size: 11px; }
                @media (max-width: 380px) { main { padding: 28px 22px 22px; } h1 { font-size: 21px; } }
              </style>
            </head>
            <body>
              <main>
                <img src="data:image/webp;base64,{{LOGO}}" alt="Lingga Indonesia">
                <div class="status"><span class="dot"></span>TIDAK ADA KONEKSI</div>
                <h1>Anda sedang offline</h1>
                <p>Hubungkan perangkat ke internet untuk login dan membuka data terbaru.</p>
                <a href="{{RETRY_URL}}">Coba lagi<span aria-hidden="true">→</span></a>
                <footer>Lingga Indonesia · Pemetaan Kota Malang 2026</footer>
              </main>
            </body>
            </html>
            """;
    private static final int FILE_CHOOSER_REQUEST = 2001;
    private static final int LOCATION_PERMISSION_REQUEST = 2002;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraImageUri;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private boolean isShowingOfflinePage;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(20, 37, 61));
        webView = new WebView(this);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        setContentView(rootView);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
                            | WindowInsetsCompat.Type.ime()
            );
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) webView.getLayoutParams();
            params.setMargins(insets.left, insets.top, insets.right, insets.bottom);
            webView.setLayoutParams(params);
            return windowInsets;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                Uri uri = Uri.parse(url);
                if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost())) {
                    isShowingOfflinePage = false;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeUrl(Uri.parse(url));
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    showOfflinePage();
                }
            }

            @Override
            public void onReceivedHttpError(
                    WebView view,
                    WebResourceRequest request,
                    android.webkit.WebResourceResponse response
            ) {
                if (request.isForMainFrame() && response.getStatusCode() >= 500) {
                    showOfflinePage();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent picker = new Intent(Intent.ACTION_GET_CONTENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType(resolveMimeType(params.getAcceptTypes()));
                picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                        params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                Intent chooser = Intent.createChooser(picker, "Pilih dokumen atau foto");
                if (isImageOnly(params.getAcceptTypes())) {
                    Intent cameraIntent = createCameraIntent();
                    if (cameraIntent != null) {
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cameraIntent});
                    }
                }

                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (android.content.ActivityNotFoundException exception) {
                    filePathCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                Uri uri = Uri.parse(origin);
                if (!"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) {
                    callback.invoke(origin, false, false);
                    return;
                }

                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }

                if (locationCallback != null) {
                    locationCallback.invoke(locationOrigin, false, false);
                }
                locationOrigin = origin;
                locationCallback = callback;
                requestPermissions(
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,
                                Manifest.permission.ACCESS_FINE_LOCATION},
                        LOCATION_PERMISSION_REQUEST
                );
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.getSettings().setSafeBrowsingEnabled(true);
        }

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private boolean routeUrl(Uri uri) {
        if ("https".equals(uri.getScheme()) && APP_HOST.equals(uri.getHost())) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (android.content.ActivityNotFoundException exception) {
            return true;
        }
        return true;
    }

    private void showOfflinePage() {
        if (isShowingOfflinePage || webView == null) return;
        isShowingOfflinePage = true;
        webView.loadDataWithBaseURL(
                "https://offline.local/",
                buildOfflinePage(),
                "text/html",
                "UTF-8",
                null
        );
    }

    private String buildOfflinePage() {
        try (InputStream logo = getAssets().open("lingga-logo.webp");
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int count;
            while ((count = logo.read(chunk)) != -1) {
                buffer.write(chunk, 0, count);
            }
            String encodedLogo = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);
            return OFFLINE_PAGE
                    .replace("{{LOGO}}", encodedLogo)
                    .replace("{{RETRY_URL}}", START_URL);
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to load the bundled offline logo.", exception);
        }
    }

    private String resolveMimeType(String[] acceptTypes) {
        Set<String> mimeTypes = new LinkedHashSet<>();
        boolean hasFileExtension = false;
        for (String acceptType : acceptTypes) {
            if (acceptType == null || acceptType.isBlank()) continue;
            for (String type : acceptType.split(",")) {
                String normalized = type.trim().toLowerCase(Locale.ROOT);
                if (normalized.startsWith(".")) {
                    hasFileExtension = true;
                    continue;
                }
                if (normalized.contains("/")) mimeTypes.add(normalized);
            }
        }

        if (mimeTypes.isEmpty()) return "*/*";
        if (hasFileExtension || mimeTypes.size() > 1) return "*/*";
        if (mimeTypes.size() == 1) return mimeTypes.iterator().next();
        return "*/*";
    }

    private boolean isImageOnly(String[] acceptTypes) {
        if (acceptTypes.length == 0) return false;
        for (String acceptType : acceptTypes) {
            if (acceptType == null || !acceptType.trim().equalsIgnoreCase("image/*")) {
                return false;
            }
        }
        return true;
    }

    private Intent createCameraIntent() {
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (intent.resolveActivity(getPackageManager()) == null) return null;

        try {
            File cameraDirectory = new File(getCacheDir(), "camera");
            if (!cameraDirectory.exists() && !cameraDirectory.mkdirs()) return null;
            File image = File.createTempFile("capture_", ".jpg", cameraDirectory);
            cameraImageUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    image
            );
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraImageUri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return intent;
        } catch (IOException exception) {
            cameraImageUri = null;
            return null;
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && locationCallback != null) {
            locationCallback.invoke(locationOrigin, hasLocationPermission(), false);
            locationCallback = null;
            locationOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data == null && cameraImageUri != null) {
                results = new Uri[]{cameraImageUri};
            } else if (data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                ArrayList<Uri> uris = new ArrayList<>(count);
                for (int index = 0; index < count; index++) {
                    uris.add(data.getClipData().getItemAt(index).getUri());
                }
                results = uris.toArray(new Uri[0]);
            } else if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        cameraImageUri = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (locationCallback != null) {
            locationCallback.invoke(locationOrigin, false, false);
            locationCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
