// Văn bản pháp lý (tự soạn) – nên nhờ luật sư rà soát trước khi mở rộng ra công chúng.
(function () {
  const OWNER = 'Quản trị viên Học từ vựng (chưa đăng ký pháp lý với cơ quan chức năng)';
  const CONTACT = 'levitri2711@gmail.com';
  const UPDATED = '16/11/2026';
  const PAGES = {
    privacy: ['Chính sách bảo mật', `
      <h2>1. Dữ liệu chúng tôi thu thập</h2>
      <ul><li><b>Email</b>: để gửi link đăng nhập và thông báo cấp quyền. Không thu thập mật khẩu.</li>
      <li><b>Tiến độ học</b>: mức độ thuộc của từng từ, lịch ôn, kết quả bài tập, câu bạn viết hoặc nói (dạng chữ) trong bài Writing/Speaking.</li>
      <li><b>Bộ từ bạn tạo</b>, bình luận và yêu cầu chia sẻ.</li>
      <li><b>Nhật ký hệ thống</b>: thời điểm đăng nhập, thay đổi quyền, thay đổi nội dung — để bảo mật và xử lý khiếu nại.</li></ul>
      <h2>2. Mục đích sử dụng</h2>
      <p>Chỉ để vận hành việc học: đăng nhập, lưu tiến độ, nhắc ôn, chấm bài, quản trị quyền truy cập. Không bán, không cho thuê, không dùng cho quảng cáo.</p>
      <h2>3. Nơi lưu trữ và bên thứ ba</h2>
      <ul><li>Dữ liệu lưu trên Google Sheets và Google Drive của đơn vị vận hành (dịch vụ Google Apps Script).</li>
      <li><b>Giọng nói</b>: tính năng Speaking dùng bộ nhận giọng nói của trình duyệt. Trên Chrome, âm thanh được gửi tới Google để chuyển thành chữ; Safari dùng dịch vụ của Apple. Chúng tôi chỉ nhận lại phần chữ, không lưu âm thanh.</li>
      <li><b>Chấm ngữ pháp</b>: câu bạn viết có thể được gửi tới LanguageTool (languagetool.org) để kiểm tra lỗi. Không gửi email hay tên của bạn.</li>
      <li><b>Tra từ</b>: từ bạn tra được gửi tới Free Dictionary API và Datamuse.</li>
      <li>Phát âm dùng giọng đọc có sẵn trong trình duyệt hoặc hệ điều hành của bạn.</li></ul>
      <h2>4. Thời gian lưu</h2>
      <p>Dữ liệu được lưu khi tài khoản còn hoạt động. Khi quyền bị thu hồi hoặc bạn yêu cầu xoá, tiến độ học sẽ được xoá trong vòng 30 ngày; nhật ký bảo mật có thể được giữ tối đa 12 tháng.</p>
      <h2>5. Quyền của bạn</h2>
      <p>Bạn có quyền yêu cầu xem, sửa, xuất hoặc xoá dữ liệu của mình bằng cách gửi email tới ${CONTACT}.</p>
      <h2>6. Bảo mật</h2>
      <p>Link đăng nhập dùng một lần, hết hạn sau 15 phút; phiên đăng nhập được ký điện tử và hết hạn sau 30 ngày; quyền truy cập được kiểm tra ở máy chủ cho mọi thao tác.</p>`],
    terms: ['Điều khoản sử dụng', `
      <h2>1. Tài khoản và quyền truy cập</h2>
      <p>Học từ vựng là ứng dụng học tập nội bộ do ${OWNER} vận hành. Quyền truy cập (Viewer, Học viên, Editor) do quản trị viên cấp và có thể thu hồi bất cứ lúc nào. Không chia sẻ link đăng nhập cho người khác.</p>
      <h2>2. Nội dung</h2>
      <ul><li>Bộ từ có sẵn thuộc quyền quản lý của đơn vị vận hành, chỉ dùng cho mục đích học tập cá nhân, không sao chép để kinh doanh.</li>
      <li>Bạn chịu trách nhiệm về nội dung bạn tải lên (bộ từ, bình luận) và cam kết không vi phạm bản quyền, không chứa nội dung trái pháp luật.</li>
      <li>Quản trị viên có quyền sửa hoặc gỡ nội dung vi phạm.</li></ul>
      <h2>3. Hành vi bị cấm</h2>
      <p>Truy cập trái phép, can thiệp hệ thống, gửi yêu cầu tự động hàng loạt, giả mạo người khác.</p>
      <h2>4. Thay đổi dịch vụ</h2>
      <p>Tính năng có thể được thay đổi, tạm dừng để bảo trì hoặc nâng cấp mà không cần báo trước.</p>`],
    disclaimer: ['Miễn trừ trách nhiệm', `
      <ul><li>Điểm band trong bài Writing/Speaking là <b>ước lượng tự động ở cấp câu</b>, chỉ để tham khảo, không phải điểm IELTS chính thức và không thay thế đánh giá của giám khảo.</li>
      <li>IELTS là thương hiệu thuộc sở hữu của British Council, IDP: IELTS Australia và Cambridge University Press & Assessment. Học từ vựng không liên kết hay được bảo trợ bởi các tổ chức này.</li>
      <li>Nghĩa, phiên âm và ví dụ được biên soạn cẩn thận nhưng có thể còn sai sót; dữ liệu tra tự động từ nguồn miễn phí cần được kiểm tra lại.</li>
      <li>Kết quả học tập phụ thuộc vào mức độ luyện tập của người học; chúng tôi không cam kết điểm số cụ thể.</li>
      <li>Các dịch vụ bên thứ ba (Google, Apple, LanguageTool, Free Dictionary API, Datamuse) có chính sách riêng; chúng tôi không chịu trách nhiệm về việc gián đoạn của các dịch vụ đó.</li></ul>`],
    complaints: ['Quy trình tiếp nhận và xử lý khiếu nại', `
      <h2>Bước 1 — Gửi khiếu nại</h2><p>Gửi email tới ${CONTACT}, nêu email tài khoản, mô tả vấn đề và ảnh chụp màn hình (nếu có).</p>
      <h2>Bước 2 — Xác nhận</h2><p>Chúng tôi xác nhận đã nhận khiếu nại trong vòng 2 ngày làm việc.</p>
      <h2>Bước 3 — Xử lý</h2><p>Lỗi kỹ thuật: xử lý trong 2–5 ngày làm việc. Vấn đề về nội dung hoặc quyền truy cập: phản hồi trong 7 ngày làm việc.</p>
      <h2>Bước 4 — Phản hồi kết quả</h2><p>Kết quả và cách khắc phục (sửa nội dung, khôi phục quyền, khôi phục dữ liệu nếu có thể) được gửi lại qua email.</p>`],
  };

  function view(key, shell, loggedIn) {
    const p = PAGES[key];
    const body = p ? `<div class="narrow"><h1>${p[0]}</h1><p class="small muted">Cập nhật: ${UPDATED} · Đơn vị vận hành: ${OWNER}</p>${p[1]}
      <p class="small"><a href="#/legal/privacy">Bảo mật</a> · <a href="#/legal/terms">Điều khoản</a> · <a href="#/legal/disclaimer">Miễn trừ</a> · <a href="#/legal/complaints">Khiếu nại</a> · <a href="#/">Trang chủ</a></p></div>`
      : '<div class="notice bad">Không tìm thấy trang.</div>';
    if (loggedIn) shell('settings', body);
    else document.getElementById('app').innerHTML = `<main>${body}</main>`;
  }
  window.VolLegal = { view };
})();
