# H? th?ng T?ng h?p D? li?u Excel (Consolidation System v2.0)

?ng d?ng web chuy�n d?ng d? ti?p nh?n, x? l� v� t?ng h?p d? li?u t? c�c file Excel b�o c�o c?a c�c don v? th�nh vi�n. T�ch h?p Firebase d? luu tr? d? li?u tr?c tuy?n v� qu?n l� quy?n truy c?p Admin.

## ?? T�nh nang ch�nh
- **Ti?p nh?n File:** T? d?ng d?c d? li?u t? c�c bi?u m?u Excel (1B, 5A, 5B...) b?ng thu vi?n `xlsx`.
- **Dashboard:** Bi?u d? tr?c quan v? t? l? n?p b�o c�o v� th?ng k� t?ng qu�t.
- **B�o c�o:** Xem d? li?u t?ng h?p theo t?ng bi?u m?u, h? tr? l?c theo nam.
- **Firebase Integration:** 
  - Luu tr? d? li?u th?i gian th?c tr�n Firestore.
  - Dang nh?p Admin b?ng t�i kho?n Google.
  - B?o m?t d? li?u b?ng Security Rules.
- **Giao di?n:** Thi?t k? hi?n d?i, t?i gi?n (Brutalist Style) s? d?ng Tailwind CSS.

## ?? C�ng ngh? s? d?ng
- **Frontend:** React 18, TypeScript, Vite.
- **Styling:** Tailwind CSS, Lucide Icons.
- **Charts:** Recharts.
- **Database & Auth:** Firebase (Firestore, Auth).
- **Excel Processing:** XLSX (SheetJS).

## ?? Hu?ng d?n c�i d?t (Local)

1. **T?i m� ngu?n:**
   ```bash
   git clone <your-github-url>
   cd <folder-name>
   ```

2. **C�i d?t thu vi?n:**
   ```bash
   npm install
   ```

3. **Ch?y ?ng d?ng:**
   ```bash
   npm run dev
   ```
   ?ng d?ng s? ch?y t?i: `http://localhost:3000`

## ?? C?u h�nh Firebase
?ng d?ng y�u c?u m?t d? �n Firebase d? ho?t d?ng. C�c th�ng s? c?u h�nh n?m trong file `firebase-applet-config.json`.
- D?m b?o d� b?t **Google Authentication** trong Firebase Console.
- N?p quy t?c b?o m?t t? file `firestore.rules` v�o ph?n **Firestore -> Rules**.

## ?? Gi?y ph�p
B?n quy?n thu?c v? ldkien116@gmail.com.

