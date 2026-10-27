package com.pustakam.app;

import android.graphics.Color;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Paints the strips behind the phone's status bar and navigation bar in the
 * app's theme colour. On older Android WebViews, Capacitor keeps the page out
 * of those strips and they would otherwise always be white.
 * Called from script.js as Capacitor.Plugins.WindowColor.set({ color: '#161412' }).
 */
@CapacitorPlugin(name = "WindowColor")
public class WindowColorPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        String color = call.getString("color", "#FFFFFF");
        int parsed;
        try {
            parsed = Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            call.reject("Not a colour: " + color);
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(parsed);
            call.resolve();
        });
    }
}
