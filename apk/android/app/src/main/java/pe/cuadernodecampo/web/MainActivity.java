package pe.cuadernodecampo.web;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Hosts the Cuaderno de Campo web app.
 * - Android's back button walks back through the web pages instead of closing the app.
 * - `window.CuadernoAndroid` lets the web hand over generated files (backups, reports, attachments):
 *   an Android WebView cannot download blobs, so the bytes arrive in base64 chunks, are written to the
 *   app cache and offered through the share sheet (save to Drive/Files, WhatsApp…) or a viewer.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new FileBridge(), "CuadernoAndroid");
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    private final class FileBridge {
        private final Map<String, File> files = new HashMap<>();
        private final Map<String, String> types = new HashMap<>();

        /** Starts a new file; returns its id. Earlier shared files are cleared. */
        @JavascriptInterface
        public synchronized String begin(String name, String mime) throws IOException {
            File dir = new File(getCacheDir(), "compartidos");
            if (files.isEmpty() && dir.isDirectory()) {
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
            }
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No cache folder");
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (safe.isEmpty()) safe = "archivo";
            File file = new File(dir, safe);
            new FileOutputStream(file, false).close();
            String id = UUID.randomUUID().toString();
            files.put(id, file);
            types.put(id, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            return id;
        }

        @JavascriptInterface
        public synchronized void append(String id, String base64) throws IOException {
            File file = files.get(id);
            if (file == null) throw new IOException("Unknown file");
            try (FileOutputStream out = new FileOutputStream(file, true)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
        }

        /** mode "view" opens the file in a viewer (PDF…); anything else opens the share sheet. */
        @JavascriptInterface
        public synchronized void finish(String id, String mode) {
            File file = files.remove(id);
            String mime = types.remove(id);
            if (file == null) return;
            Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent share = Intent.createChooser(send, file.getName());
            runOnUiThread(() -> {
                if ("view".equals(mode)) {
                    Intent view = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, mime)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(view);
                        return;
                    } catch (ActivityNotFoundException ignored) {
                        // No viewer for this type: fall back to sharing.
                    }
                }
                startActivity(share);
            });
        }
    }
}
