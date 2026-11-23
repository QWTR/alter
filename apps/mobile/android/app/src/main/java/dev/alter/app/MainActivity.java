package dev.alter.app;

import android.app.DownloadManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebBackForwardList;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * ALTTER for Android. The app is a thin native shell: a start page (assets/public/index.html) finds ALTTER on the
 * user's computer — through their relay (e.g. https://altter.v-room.app) or straight on the same Wi-Fi — and then
 * shows the real ALTTER web app in this WebView. Everything (chats, memory, agents) stays on the computer.
 */
public class MainActivity extends BridgeActivity {

    private static final int BG = Color.parseColor("#0b0a12");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.getDecorView().setBackgroundColor(BG);

        // Edge-to-edge (Android 15+): keep the page out from under the status bar, the gesture bar and the keyboard.
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(BG);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        WebView web = getBridge().getWebView();
        web.setBackgroundColor(BG);
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> download(url, userAgent, contentDisposition, mimeType));

        // Back: go back inside ALTTER; never back onto the start page (it would just reconnect) — leave the app instead.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge().getWebView();
                WebBackForwardList list = w.copyBackForwardList();
                int i = list.getCurrentIndex();
                if (i > 0) {
                    String prev = list.getItemAtIndex(i - 1).getUrl();
                    if (prev != null && !isStartPage(prev)) {
                        w.goBack();
                        return;
                    }
                }
                moveTaskToBack(true);
            }
        });
    }

    private static boolean isStartPage(String url) {
        return url.startsWith("https://localhost/") || url.equals("https://localhost");
    }

    /** Files ALTTER offers to save (renders, exports, attachments) go to Downloads, with the signed-in cookies. */
    private void download(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                Toast.makeText(this, R.string.download_unsupported, Toast.LENGTH_SHORT).show();
                return;
            }
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            req.addRequestHeader("User-Agent", userAgent);
            req.setMimeType(mimeType);
            req.setTitle(name);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, getString(R.string.download_started, name), Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }
}
