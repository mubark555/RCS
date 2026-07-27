import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";
import { SettingsProvider } from "@/components/SettingsProvider";
import { RoleProvider } from "@/components/RoleProvider";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: "نظام إدارة سيم برايم",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي سيم برايم",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SettingsProvider>
          <RoleProvider>
            <div className="app">
              <Sidebar />
              <div className="main">
                <TopBar />
                <div className="content">{children}</div>
              </div>
            </div>
          </RoleProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
