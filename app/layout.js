import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata = {
  title: "نظام إدارة سيم برايم | Seem Prime",
  description:
    "نظام إلكتروني متكامل لإدارة مشاريع ومهام المتعاقدين مع الشريك التشغيلي فيوليت",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <NavBar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
