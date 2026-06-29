// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Linux/WebKitGTK stability fixes. Must run before the webview (GTK) inits.
    #[cfg(target_os = "linux")]
    {
        // 1. DMABUF renderer hangs / blanks the window on several GPU+driver
        //    combos. Force the reliable fallback.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        // 2. WebKitGTK freezes ("not responding") on window resize/maximize under
        //    Wayland. Route through X11 (XWayland) when in a Wayland session.
        if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && std::env::var_os("GDK_BACKEND").is_none()
        {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    asterion_desktop_lib::run()
}
