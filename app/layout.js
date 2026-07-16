import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: "نظام إدارة سيم برايم | Seem Prime",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي فيوليت",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="app">
          <Sidebar />
          <div className="main">
            <TopBar />
            <div className="content">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
