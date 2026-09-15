- Đây là Extension tích hợp trên trình duyệt chrome hỗ trợ việc kết nối load điểm từ các khóa học trên hệ thống Canvas LMS.
- Hỗ trợ xuất điểm theo lớp (Section), theo khóa học và kết quả trả về dưới dạng file csv.
- Rút trích điểm theo mã sinh viên và sử dụng kết quả này để import lên hệ thống nhập điểm của giảng viên.
- Tool này cho phép chuyển điểm lên google sheet, update và chia sẻ cho sinh viên theo dõi.
- **HƯỚNG DẪN:**
  + **Ví dụ:** https://canvas.donga.edu.vn/courses/373  
  + **Canvas:** https://canvas.donga.edu.vn
  + **Token:**
  <img width="949" height="1019" alt="image" src="https://github.com/user-attachments/assets/2b6a2f7e-83fd-4b27-a73a-14511c340c00" />

  + **Course:** 373
  + **Web App URL:** link của web app
    
    **1. Tạo file google sheet**
    
    **2. Chọn Extensions -> Chọn Apps Script -> Dán toàn bộ mã nguồn bên dưới vào**

            function doPost(e) {
                  try {
                    var data = JSON.parse(e.postData.contents);
                    var ss = SpreadsheetApp.getActiveSpreadsheet();            
                    // Nhận tên lớp từ Extension để làm tên Sheet (Tab)
                    var sheetName = data.sheetName || "Sheet1";
                    var sheet = ss.getSheetByName(sheetName);            
                    // Nếu tab mang tên lớp này chưa tồn tại -> Tự động tạo mới
                    if (!sheet) {
                      sheet = ss.insertSheet(sheetName);
                    }
                    // TỐI ƯU HÓA: Thay vì sheet.clear(), ta dùng sheet.clearContents()
                    // Lệnh này CHỈ XÓA DỮ LIỆU, giữ nguyên 100% định dạng (màu sắc, viền, font chữ...)
                    sheet.clearContents();
                
                    // Ghi tiêu đề cột một cách chính xác vào Dòng 1
                    // (Dùng getRange thay vì appendRow để đảm bảo không bị lệch dòng nếu sheet có định dạng sẵn)
                    if (data.headers && data.headers.length > 0) {
                      sheet.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
                    }
                
                    // Ghi mảng dữ liệu bắt đầu từ Dòng 2
                    if (data.rows && data.rows.length > 0) {
                      sheet.getRange(2, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
                    }
                
                    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
                      .setMimeType(ContentService.MimeType.JSON);
                  } catch (err) {
                    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()}))
                      .setMimeType(ContentService.MimeType.JSON);
                  }
            }   
    **3. Deploy -> New deployment và thiết lập như hình**

 <img width="450" height="400" alt="image" src="https://github.com/user-attachments/assets/d86486a9-12c6-4664-a2e8-8c92aa6fc2e6" />

 
   **4. Copy link web app như hình**
   
<img width="450" height="350" alt="image" src="https://github.com/user-attachments/assets/2cd4e32d-998c-4303-9918-4201db3710a5" />







  
    





