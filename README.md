# Karaoke MVP

Hệ thống Karaoke Gia đình hoàn toàn Serverless chạy trên GitHub Pages, sử dụng Firebase Realtime Database và YouTube API.

## Kiến trúc
- Frontend: HTML5, CSS3, Vanilla JS ES Modules
- Database: Firebase Realtime Database
- Authentication: Firebase Anonymous Authentication
- Player: YouTube IFrame Player API
- Search: YouTube Data API v3
- Hosting: GitHub Pages

## Hướng dẫn thiết lập và triển khai

### STEP 1: Tạo Firebase project
Truy cập [Firebase Console](https://console.firebase.google.com/), tạo một dự án mới.

### STEP 2: Bật Anonymous Authentication
Trong menu bên trái, chọn **Authentication** -> **Sign-in method**. Bật **Anonymous** (Ẩn danh).

### STEP 3: Tạo Realtime Database
Trong menu bên trái, chọn **Realtime Database**. Tạo database (chọn vị trí gần nhất, ví dụ Singapore). Bắt đầu ở chế độ **Locked mode**.

### STEP 4: Lấy Firebase configuration
Vào **Project settings** (biểu tượng bánh răng), kéo xuống phần **Your apps**, tạo một Web App. 
Copy đoạn config `firebaseConfig`.

### STEP 5: Dán configuration vào project
Mở file `js/firebase-config.js` và dán các thông số của bạn vào biến `firebaseConfig`.

### STEP 6: Deploy Security Rules
Copy nội dung file `database.rules.json` và dán vào tab **Rules** trong Firebase Realtime Database, sau đó nhấn **Publish**.

### STEP 7: Kích hoạt YouTube Data API v3
Truy cập [Google Cloud Console](https://console.cloud.google.com/). Chọn dự án tương ứng với dự án Firebase vừa tạo.
Tìm kiếm và bật **YouTube Data API v3**.

### STEP 8: Tạo API Key
Vào **APIs & Services** -> **Credentials**, tạo một **API key**.

### STEP 9: Giới hạn API Key (Restrict)
Bấm vào API Key vừa tạo để chỉnh sửa:
- **Application restrictions**: Chọn **HTTP referrers (web sites)**. Thêm đường dẫn GitHub Pages của bạn, ví dụ: `https://USERNAME.github.io/*` (hoặc `http://localhost:*` nếu test local).
- **API restrictions**: Chọn **Restrict key** và chỉ chọn **YouTube Data API v3**.

### STEP 10: Điền YouTube API Key
Mở `js/firebase-config.js` và điền key vào biến `YOUTUBE_API_KEY`.

### STEP 11: Tạo GitHub Repository
Tạo một repository mới trên GitHub (ví dụ: `KaraokeFun`).

### STEP 12: Push source code
Commit và push toàn bộ source code này lên repository.

### STEP 13: Cấu hình GitHub Pages
Trong GitHub repo:
1. Vào **Settings** -> **Pages**.
2. Mục **Source**, chọn **Deploy from a branch**.
3. Chọn nhánh `main` (hoặc `master`), thư mục `/ (root)`.
4. Nhấn **Save**.

### STEP 14: Truy cập ứng dụng
Đợi vài phút cho GitHub Pages deploy. Sau đó mở URL:
`https://USERNAME.github.io/KaraokeFun/index.html` (thay `USERNAME` và `KaraokeFun` bằng repo của bạn).

### STEP 15: Kiểm tra (Test Checklist)
- Mở trang TV (trên máy tính hoặc Smart TV), tạo phòng. Kiểm tra xem mã QR có chứa đúng URL không.
- Dùng điện thoại quét QR. Kiểm tra xem vào phòng có thành công không.
- Trên điện thoại, tìm bài hát (cần API key hợp lệ).
- Thêm bài hát vào hàng đợi.
- Kiểm tra TV xem có nhận được bài hát và tự động phát không.
- Thử các nút điều khiển PLAY/PAUSE/NEXT/PREV trên điện thoại.

## Lưu ý về Bảo mật
Do GitHub Pages là static hosting, API Key của YouTube và Firebase sẽ hiển thị ở phía Client. 
- **Firebase**: Được bảo vệ thông qua Firebase Security Rules (`database.rules.json`).
- **YouTube API Key**: **Bắt buộc** phải giới hạn HTTP referrers trong Google Cloud Console để tránh bị lạm dụng quota.
