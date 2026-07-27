import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";
import { SettingsProvider } from "@/components/SettingsProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { RoleProvider } from "@/components/RoleProvider";
import { NotificationsProvider } from "@/components/NotificationsProvider";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "سيم برايم - إدارة المشاريع",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي سيم برايم",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SettingsProvider>
          <AuthProvider>
            <RoleProvider>
              <NotificationsProvider>
                <AppShell>{children}</AppShell>
              </NotificationsProvider>
            </RoleProvider>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
