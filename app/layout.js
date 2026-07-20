import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./globals.css";
import { RoleProvider } from "@/components/RoleProvider";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: "نظام إدارة سيم برايم | ڤيوليت",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي ڤيوليت",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <RoleProvider>
          <div className="app">
            <Sidebar />
            <div className="main">
              <TopBar />
              <div className="content">{children}</div>
            </div>
          </div>
        </RoleProvider>
      </body>
    </html>
  );
}
