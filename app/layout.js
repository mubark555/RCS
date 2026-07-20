import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";
import { SettingsProvider } from "@/components/SettingsProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { RoleProvider } from "@/components/RoleProvider";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "نظام إدارة سيم برايم | ڤيوليت",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي ڤيوليت",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SettingsProvider>
          <AuthProvider>
            <RoleProvider>
              <AppShell>{children}</AppShell>
            </RoleProvider>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
