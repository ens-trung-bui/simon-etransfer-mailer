# Simon SMTP

Script JavaScript (Node.js >= 22) dùng Nodemailer và Gmail App Password để gửi email fixture kiểm tra Simon eTransfer. Không cần OAuth hay mật khẩu Gmail chính.
HTML được rút gọn từ mẫu cung cấp, giữ các thông tin chính và bố cục; bỏ link token cá nhân và thêm nhãn TEST để không nhầm với thanh toán thật.

## Cấu hình

```bash
cd simon-smtp
pnpm install
cp .env.example .env
```

Sửa `.env` bằng SMTP của bạn và inbox test. Gmail dùng App Password, không dùng mật khẩu đăng nhập thông thường. Không commit `.env`.

## Chạy

```bash
pnpm start
```

Script lần lượt hỏi số tiền CAD, tên người gửi, invoice, agreement, reference và email nhận.

- Enter ở số tiền / tên người gửi: dùng mặc định (`1667.30`, `JANE DAY SMITH`).
- Enter ở Invoice / Agreement: bỏ trống. Có thể bỏ trống một hoặc cả hai mã.
- Nhập `-`: bỏ trống trường, hữu ích để test chỉ invoice / chỉ agreement / không có mã.
- Reference mặc định sinh mới mỗi lần để tránh worker deduplicate.
- Xác nhận `y` mới gửi, mặc định không gửi.
- Tạo `preview.html` trước khi gửi; mở file bằng trình duyệt để xem.

Chỉ preview (không kết nối SMTP):

```bash
pnpm preview
```

Subject giữ cụm `from … and it has been automatically deposited.` và số tiền trước tên người gửi theo parser hiện tại. Message chứa `Invoice #… Agreement #…`. Gửi thêm `X-PaymentKey` và `X-Date` (`DD-MM-YYYY HH:mm`) vì worker đọc reference/date từ headers, không phải body.

**Chỉ gửi vào inbox/môi trường test.** Nhãn TEST không ngăn worker xử lý: nếu gửi vào inbox production mà worker đọc được, email có thể tạo payment/invoice thật trong database. Sender là SMTP_FROM của bạn, không giả địa chỉ Interac. Gmail/rule lọc sender có thể cần cấu hình riêng cho inbox test; script không thay đổi worker hay Gmail filters.
