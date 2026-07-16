import "./globals.css";

export const metadata = {
  title: "إدراج الأسماء في PowerPoint",
  description:
    "أداة بسيطة تدرج الأسماء من ملف Excel داخل قالب PowerPoint وتنشئ شريحة لكل اسم.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
