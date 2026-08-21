package com.spacehub.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.fragment.app.FragmentActivity;
import androidx.leanback.app.RowsSupportFragment;
import androidx.leanback.widget.ArrayObjectAdapter;
import androidx.leanback.widget.HeaderItem;
import androidx.leanback.widget.ListRow;
import androidx.leanback.widget.OnItemViewClickedListener;
import androidx.leanback.widget.OnItemViewSelectedListener;
import androidx.leanback.widget.Presenter;
import androidx.leanback.widget.Row;
import androidx.leanback.widget.RowPresenter;

/**
 * SpaceHub — Android TV MainActivity
 * Point d'entrée principal pour l'application Android TV.
 * Utilise le framework Leanback pour l'interface 10-foot.
 */
public class MainActivity extends FragmentActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Charger l'interface web SpaceHub dans un WebView
        // avec le mode TV activé
        if (findViewById(R.id.main_browse_fragment) != null) {
            loadSpaceHubWeb();
        }
    }

    private void loadSpaceHubWeb() {
        // WebView avec configuration pour Android TV
        // Le mode TV sera activé via JavaScript
        WebView webView = findViewById(R.id.webview);
        
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        
        // Charger l'application locale
        webView.loadUrl("file:///android_asset/dist/index.html");
        
        // Activer le mode TV via JavaScript
        webView.evaluateJavascript(
            "if (window.SpaceHub && window.SpaceHub.tvMode) { window.SpaceHub.tvMode.enable(); }",
            null
        );
    }
}
