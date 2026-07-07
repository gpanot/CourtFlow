"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";

type Lang = "en" | "vi" | "th";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const UI: Record<Lang, {
  title: string; subtitle: string; online: string; quickLabel: string; placeholder: string;
  quickActions: { label: string; key: string }[];
}> = {
  en: {
    title: "CourtFlow Assistant",
    subtitle: "Online",
    online: "Online",
    quickLabel: "Quick actions",
    placeholder: "Ask anything about CourtFlow...",
    quickActions: [
      { label: "Check in player", key: "checkin" },
      { label: "Add membership", key: "membership" },
      { label: "Manage bookings", key: "bookings" },
      { label: "Assign courts", key: "courts" },
      { label: "Process payment", key: "payment" },
      { label: "Face recognition issue", key: "face" },
    ],
  },
  vi: {
    title: "Trợ lý CourtFlow",
    subtitle: "Trực tuyến",
    online: "Trực tuyến",
    quickLabel: "Thao tác nhanh",
    placeholder: "Hỏi bất cứ điều gì về CourtFlow...",
    quickActions: [
      { label: "Điểm danh người chơi", key: "checkin" },
      { label: "Thêm thành viên", key: "membership" },
      { label: "Quản lý đặt sân", key: "bookings" },
      { label: "Phân sân", key: "courts" },
      { label: "Xử lý thanh toán", key: "payment" },
      { label: "Lỗi nhận diện khuôn mặt", key: "face" },
    ],
  },
  th: {
    title: "ผู้ช่วย CourtFlow",
    subtitle: "ออนไลน์",
    online: "ออนไลน์",
    quickLabel: "การดำเนินการด่วน",
    placeholder: "ถามอะไรก็ได้เกี่ยวกับ CourtFlow...",
    quickActions: [
      { label: "เช็คอินผู้เล่น", key: "checkin" },
      { label: "เพิ่มสมาชิก", key: "membership" },
      { label: "จัดการการจอง", key: "bookings" },
      { label: "จัดสรรสนาม", key: "courts" },
      { label: "ประมวลผลการชำระเงิน", key: "payment" },
      { label: "ปัญหาการจดจำใบหน้า", key: "face" },
    ],
  },
};

const CACHED_EN: Record<string, string> = {
  checkin: "To check in a player (CourtPay kiosk or mobile app):\n1. Go to **CourtPay** in the left menu (CourtPay - Check-in section)\n2. Select the venue\n3. The camera activates — ask the player to look at the camera\n4. If face recognition fails, tap **Manual Search** and search by name or phone\n5. Confirm the check-in — a VietQR payment QR is generated automatically\n6. If auto-payment (Sepay) is enabled, payment confirms without staff action\n\nTo add a new player: go to **CourtPass Players** → click **Add Player** — email is required (an activation email is sent automatically; staff do not set a password)\nTo delete a player: open the player detail → scroll to the bottom → double-confirm delete",
  membership: "To activate a new membership:\n1. Go to **Memberships** in the left menu (CourtPass - Booking section)\n2. Select the venue\n3. Click the green **Activate** button (top right)\n4. Search for the player by name in the modal\n5. Select the player from the results\n6. Choose the membership tier from the dropdown\n7. Click **Activate** — the member appears in the table\n\nTo manage program passes (class-based): go to **Program Passes** (superadmin only) — create pass types linked to coaches, activate passes for players, and track check-ins",
  bookings: "To manage court bookings:\n1. Go to **Bookings** in the left menu (CourtPass - Booking section)\n2. Select the venue — the Day Planner grid shows courts as columns and time slots as rows\n3. The grid defaults to **1h view**; toggle to **30-min view** for finer granularity\n4. Click an available slot to create a booking; fill in player, duration, and optional **discount amount**\n5. Players can book multi-court group bookings (venue setting controls max courts per booking)\n6. Click an existing booking to edit, cancel, approve/reject payment, or download the **PDF invoice**\n7. Use the date arrows to navigate days\n8. Blocked slots appear as colored blocks: Open Play (green), Competition (blue), Private Event (amber), Private Competition (orange), Maintenance (grey), Alobo (violet)\n9. Go to **Schedule** tab for recurring weekly sessions; **Pricing** tab for pricing groups\n\nPricing tab — **Pricing Groups:**\n- Each venue has named pricing groups (e.g. Standard, Premium) each with its own day x hour price matrix\n- Courts are assigned to a group; individual courts can also have a full **price override** (replaces the group matrix for that court only)\n- To add/rename/delete groups or set the default: use the group tabs inside the Pricing tab\n- Court group assignment: go to **General Settings** tab → court cards → select the group from the dropdown\n\nCoaching lessons appear on the same booking grid — manage them from the **Coaching** page",
  courts: "To monitor live courts and queues:\n1. Go to **Live Sessions** in the left menu (CourtFlow - Social section)\n2. Select the venue — you can see all courts and the current queue in real time\n3. Court assignments happen from the **Staff Dashboard** (not Admin): staff drag players from the queue into court slots\n4. The **TV Display** at the venue also updates automatically via WebSocket\n5. Sessions are opened and closed from the **CourtPay mobile app** (Session tab)\n\nNote: Live Sessions is only visible for venues with CourtFlow Social access\n\nTo configure which courts are bookable and their pricing group: go to **Bookings → General Settings** tab → court cards",
  payment: "To track and confirm payments:\n1. **Court booking payments**: go to **Bookings** → click a booking → approve/reject payment proof, or download the **PDF invoice** (available once paid)\n2. **CourtPay session payments**: go to **CourtPay** → select venue → view pending/confirmed/cancelled payments\n3. **Membership payments**: go to **Memberships** → click a member → open Payment History → mark as paid with method and amount\n4. **CP Analytics**: go to **CP Analytics** → select venue → drill down by month/week/session → export CSV\n5. **Billing invoices** (superadmin): go to **CP Billing** → mark invoices as paid\n6. If Sepay auto-payment is ON, bank transfers confirm automatically\n\nBooking confirmation emails include a **magic pay link** — the player can pay directly from the email without logging in\nAll paid bookings, open play, and coaching lessons have a downloadable **PDF invoice** with a sequential reference number (e.g. CF-BK-0042)",
  face: "If face recognition is not working:\n1. Ask the player to remove glasses, face the camera directly, and ensure good lighting\n2. Retry — hold still for 2 seconds\n3. Tap **Manual Search** and type the player's name or phone number\n4. To run a system-level test: go to **Face Recognition Test** in the left menu (Logs & Errors section — superadmin only)\n5. Check **Log Errors** for any AWS Rekognition errors\n6. Check **Logs** → Auth activity summary for recent login/auth issues\n7. If a player's face is not registered, they need to enroll at the kiosk or staff can add their photo in **CourtPass Players** → player detail",
};

const CACHED_VI: Record<string, string> = {
  checkin: "Để điểm danh người chơi (kiosk CourtPay hoặc ứng dụng di động):\n1. Vào **CourtPay** ở menu bên trái (phần CourtPay - Check-in)\n2. Chọn venue\n3. Camera tự bật — yêu cầu người chơi nhìn vào camera\n4. Nếu nhận diện khuôn mặt thất bại, nhấn **Tìm thủ công** và tìm theo tên hoặc số điện thoại\n5. Xác nhận điểm danh — mã QR VietQR được tạo tự động\n6. Nếu bật tự động xác nhận (Sepay), thanh toán được xác nhận mà không cần thao tác của nhân viên\n\nThêm người chơi mới: vào **CourtPass Players** → nhấn **Add Player** — email bắt buộc (email kích hoạt được gửi tự động; nhân viên không cần đặt mật khẩu)\nXóa người chơi: mở chi tiết người chơi → cuộn xuống cuối → xác nhận xóa hai lần",
  membership: "Để kích hoạt thành viên mới:\n1. Vào **Memberships** ở menu bên trái (phần CourtPass - Booking)\n2. Chọn venue\n3. Nhấn nút **Activate** màu xanh lá (góc trên bên phải)\n4. Tìm kiếm người chơi theo tên trong hộp thoại\n5. Chọn người chơi từ kết quả\n6. Chọn gói thành viên từ danh sách\n7. Nhấn **Activate** — thành viên xuất hiện trong bảng\n\nQuản lý program passes (theo buổi học): vào **Program Passes** (chỉ superadmin) — tạo loại pass gắn với huấn luyện viên, kích hoạt pass cho người chơi và theo dõi điểm danh",
  bookings: "Để quản lý đặt sân:\n1. Vào **Bookings** ở menu bên trái (phần CourtPass - Booking)\n2. Chọn venue — lưới Day Planner hiển thị sân theo cột và khung giờ theo hàng\n3. Lưới mặc định hiển thị theo **1 giờ**; chuyển sang **30 phút** để xem chi tiết hơn\n4. Nhấn ô trống để tạo đặt sân; nhập người chơi, thời lượng và **giảm giá** (nếu có)\n5. Người chơi có thể đặt nhóm nhiều sân (cài đặt venue kiểm soát số sân tối đa)\n6. Nhấn vào đặt sân hiện có để sửa, hủy, duyệt/từ chối thanh toán hoặc tải **hóa đơn PDF**\n7. Dùng mũi tên ngày để điều hướng\n8. Ô bị khóa hiển thị dạng khối màu: Open Play (xanh lá), Competition (xanh dương), Private Event (vàng), Private Competition (cam), Maintenance (xám), Alobo (tím)\n9. Tab **Schedule**: lịch định kỳ hàng tuần; tab **Pricing**: nhóm giá\n\nTab Pricing — **Nhóm giá (Pricing Groups):**\n- Mỗi venue có các nhóm giá (ví dụ: "Standard", "Premium"), mỗi nhóm có bảng giá theo ngày × giờ riêng\n- Mỗi sân được gắn với một nhóm giá; từng sân cũng có thể có **price override** riêng (ghi đè toàn bộ bảng giá nhóm)\n- Thêm/đổi tên/xóa nhóm hoặc đặt nhóm mặc định: dùng các tab nhóm trong tab Pricing\n- Gán nhóm giá cho sân: vào tab **General Settings** → thẻ sân → chọn nhóm từ danh sách\n\nCác buổi học huấn luyện cũng hiển thị trên lưới này — quản lý từ trang **Coaching**",
  courts: "Để theo dõi sân và hàng chờ theo thời gian thực:\n1. Vào **Live Sessions** ở menu bên trái (phần CourtFlow - Social)\n2. Chọn venue — xem tất cả sân và hàng chờ hiện tại\n3. Phân sân được thực hiện từ **Staff Dashboard** (không phải Admin): nhân viên kéo người chơi từ hàng chờ vào ô sân\n4. **TV Display** tại venue cũng cập nhật tự động qua WebSocket\n5. Mở và đóng phiên từ **ứng dụng di động CourtPay** (tab Session)\n\nLưu ý: Live Sessions chỉ hiển thị cho venue có quyền truy cập CourtFlow Social\n\nĐể cấu hình sân nào cho phép đặt và nhóm giá: vào **Bookings → tab General Settings** → thẻ sân",
  payment: "Để theo dõi và xác nhận thanh toán:\n1. **Thanh toán đặt sân**: vào **Bookings** → nhấn vào đặt sân → duyệt/từ chối bằng chứng, hoặc tải **hóa đơn PDF** (sau khi đã thanh toán)\n2. **Thanh toán phiên CourtPay**: vào **CourtPay** → chọn venue → xem thanh toán chờ/đã xác nhận/đã hủy\n3. **Thanh toán thành viên**: vào **Memberships** → nhấn vào thành viên → mở Lịch sử thanh toán → đánh dấu đã thanh toán\n4. **CP Analytics**: vào **CP Analytics** → chọn venue → xem chi tiết → xuất CSV\n5. **Hóa đơn** (superadmin): vào **CP Billing** → đánh dấu hóa đơn đã thanh toán\n6. Nếu bật Sepay tự động, chuyển khoản ngân hàng được xác nhận tự động\n\nEmail xác nhận đặt sân có **đường dẫn thanh toán trực tiếp** — người chơi thanh toán ngay từ email mà không cần đăng nhập\nMọi đặt sân, open play và buổi học đã thanh toán đều có **hóa đơn PDF** có thể tải về với mã tham chiếu tuần tự (ví dụ: CF-BK-0042)",
  face: "Nếu nhận diện khuôn mặt thất bại:\n1. Yêu cầu người chơi bỏ kính, nhìn thẳng vào camera và đảm bảo ánh sáng tốt\n2. Thử lại — giữ yên 2 giây\n3. Nhấn **Tìm thủ công** và nhập tên hoặc số điện thoại\n4. Để chạy kiểm tra hệ thống: vào **Face Recognition Test** ở menu bên trái (phần Logs & Errors — chỉ superadmin)\n5. Kiểm tra **Log Errors** để xem lỗi AWS Rekognition\n6. Kiểm tra **Logs** → tóm tắt hoạt động xác thực để xem các vấn đề đăng nhập gần đây\n7. Nếu người chơi chưa đăng ký khuôn mặt, họ cần đăng ký tại kiosk hoặc nhân viên thêm ảnh trong **CourtPass Players** → chi tiết người chơi",
};

const CACHED_TH: Record<string, string> = {
  checkin: "วิธีเช็คอินผู้เล่น (คีออสก์ CourtPay หรือแอปมือถือ):\n1. ไปที่ **CourtPay** ในเมนูซ้าย (ส่วน CourtPay - Check-in)\n2. เลือกสถานที่\n3. กล้องจะเปิดขึ้น — ให้ผู้เล่นมองที่กล้อง\n4. หากจดจำใบหน้าไม่ได้ ให้แตะ **ค้นหาด้วยตนเอง** แล้วค้นหาตามชื่อหรือเบอร์โทร\n5. ยืนยันการเช็คอิน — ระบบสร้าง QR VietQR สำหรับชำระเงินโดยอัตโนมัติ\n6. หากเปิดใช้งานการชำระเงินอัตโนมัติ (Sepay) การโอนเงินจะยืนยันโดยไม่ต้องให้พนักงานดำเนินการ\n\nเพิ่มผู้เล่นใหม่: ไปที่ **CourtPass Players** → คลิก **Add Player** — ต้องใส่อีเมล (ระบบส่งอีเมลเปิดใช้งานอัตโนมัติ; ไม่ต้องตั้งรหัสผ่าน)\nลบผู้เล่น: เปิดรายละเอียดผู้เล่น → เลื่อนลงด้านล่าง → ยืนยันการลบสองครั้ง",
  membership: "วิธีเปิดใช้งานสมาชิกใหม่:\n1. ไปที่ **Memberships** ในเมนูซ้าย (ส่วน CourtPass - Booking)\n2. เลือกสถานที่\n3. คลิกปุ่ม **Activate** สีเขียว (มุมขวาบน)\n4. ค้นหาผู้เล่นตามชื่อในหน้าต่างที่เปิดขึ้น\n5. เลือกผู้เล่นจากรายการผลลัพธ์\n6. เลือกระดับสมาชิกจากเมนูแบบเลื่อนลง\n7. คลิก **Activate** — สมาชิกจะปรากฏในตาราง\n\nจัดการ program passes (แบบรายคลาส): ไปที่ **Program Passes** (superadmin เท่านั้น) — สร้างประเภท pass ที่ผูกกับโค้ช เปิดใช้งาน pass สำหรับผู้เล่น และติดตามการเช็คอิน",
  bookings: "วิธีจัดการการจองสนาม:\n1. ไปที่ **Bookings** ในเมนูซ้าย (ส่วน CourtPass - Booking)\n2. เลือกสถานที่ — ตาราง Day Planner แสดงสนามเป็นคอลัมน์และช่วงเวลาเป็นแถว\n3. ตารางแสดงค่าเริ่มต้น **1 ชั่วโมง**; สลับเป็น **30 นาที** เพื่อดูรายละเอียดมากขึ้น\n4. คลิกช่องว่างเพื่อสร้างการจอง; กรอกชื่อผู้เล่น ระยะเวลา และ **ส่วนลด** (ถ้ามี)\n5. ผู้เล่นสามารถจองกลุ่มหลายสนามได้ (ตั้งค่าจำนวนสนามสูงสุดใน venue settings)\n6. คลิกการจองที่มีอยู่เพื่อแก้ไข ยกเลิก อนุมัติ/ปฏิเสธการชำระเงิน หรือดาวน์โหลด **ใบแจ้งหนี้ PDF**\n7. ใช้ลูกศรเพื่อเปลี่ยนวัน\n8. ช่องที่ถูกบล็อกแสดงเป็นบล็อกสี: Open Play (เขียว), Competition (น้ำเงิน), Private Event (เหลือง), Private Competition (ส้ม), Maintenance (เทา), Alobo (ม่วง)\n9. แท็บ **Schedule**: ตารางประจำสัปดาห์; แท็บ **Pricing**: กลุ่มราคา\n\nแท็บ Pricing — **กลุ่มราคา (Pricing Groups):**\n- แต่ละ venue มีกลุ่มราคาที่ตั้งชื่อได้ (เช่น "Standard", "Premium") ซึ่งมีตารางราคาวัน×ชั่วโมงของตัวเอง\n- สนามแต่ละสนามถูกกำหนดให้กับกลุ่มราคา; สนามแต่ละสนามยังมี **price override** แบบเต็มได้ (แทนที่ตารางราคากลุ่มสำหรับสนามนั้นเท่านั้น)\n- เพิ่ม/เปลี่ยนชื่อ/ลบกลุ่ม หรือตั้งค่าเริ่มต้น: ใช้แท็บกลุ่มในแท็บ Pricing\n- กำหนดกลุ่มราคาให้สนาม: ไปที่แท็บ **General Settings** → การ์ดสนาม → เลือกกลุ่มจากรายการ\n\nคาบสอนโค้ชก็ปรากฏบนตารางเดียวกัน — จัดการจากหน้า **Coaching**",
  courts: "วิธีติดตามสนามและคิวแบบเรียลไทม์:\n1. ไปที่ **Live Sessions** ในเมนูซ้าย (ส่วน CourtFlow - Social)\n2. เลือกสถานที่ — ดูสนามทั้งหมดและคิวปัจจุบัน\n3. การจัดสรรสนามทำจาก **Staff Dashboard** (ไม่ใช่ Admin): พนักงานลากผู้เล่นจากคิวไปยังช่องสนาม\n4. **TV Display** ที่สถานที่ก็อัปเดตอัตโนมัติผ่าน WebSocket\n5. เปิดและปิดเซสชันจาก **แอป CourtPay บนมือถือ** (แท็บ Session)\n\nหมายเหตุ: Live Sessions จะแสดงเฉพาะ venue ที่มีสิทธิ์ CourtFlow Social เท่านั้น\n\nตั้งค่าสนามที่จองได้และกลุ่มราคา: ไปที่ **Bookings → แท็บ General Settings** → การ์ดสนาม",
  payment: "วิธีติดตามและยืนยันการชำระเงิน:\n1. **การชำระเงินการจองสนาม**: ไปที่ **Bookings** → คลิกการจอง → อนุมัติ/ปฏิเสธหลักฐาน หรือดาวน์โหลด **ใบแจ้งหนี้ PDF** (หลังจากชำระแล้ว)\n2. **การชำระเงินเซสชัน CourtPay**: ไปที่ **CourtPay** → เลือกสถานที่ → ดูการชำระเงินที่รอ/ยืนยันแล้ว/ยกเลิก\n3. **การชำระเงินสมาชิก**: ไปที่ **Memberships** → คลิกสมาชิก → เปิดประวัติการชำระเงิน → ทำเครื่องหมายว่าชำระแล้ว\n4. **CP Analytics**: ไปที่ **CP Analytics** → เลือกสถานที่ → ดูรายละเอียด → ส่งออก CSV\n5. **ใบแจ้งหนี้** (superadmin): ไปที่ **CP Billing** → ทำเครื่องหมายว่าชำระแล้ว\n6. หากเปิด Sepay อัตโนมัติ การโอนเงินจะยืนยันอัตโนมัติ\n\nอีเมลยืนยันการจองมี **ลิงก์ชำระเงินโดยตรง** — ผู้เล่นชำระเงินจากอีเมลได้เลยโดยไม่ต้องเข้าสู่ระบบ\nการจองสนาม open play และคาบเรียนที่ชำระแล้วทุกรายการมี **ใบแจ้งหนี้ PDF** ที่ดาวน์โหลดได้ พร้อมรหัสอ้างอิงลำดับ (เช่น CF-BK-0042)",
  face: "หากการจดจำใบหน้าไม่ทำงาน:\n1. ให้ผู้เล่นถอดแว่น หันหน้าตรงไปที่กล้อง และตรวจสอบให้แน่ใจว่ามีแสงเพียงพอ\n2. ลองใหม่ — หยุดนิ่ง 2 วินาที\n3. แตะ **ค้นหาด้วยตนเอง** แล้วพิมพ์ชื่อหรือเบอร์โทร\n4. เพื่อรันการทดสอบระบบ: ไปที่ **Face Recognition Test** ในเมนูซ้าย (ส่วน Logs & Errors — superadmin เท่านั้น)\n5. ตรวจสอบ **Log Errors** เพื่อดูข้อผิดพลาด AWS Rekognition\n6. ตรวจสอบ **Logs** → สรุปกิจกรรมการยืนยันตัวตน เพื่อดูปัญหาการเข้าสู่ระบบล่าสุด\n7. หากผู้เล่นยังไม่ได้ลงทะเบียนใบหน้า ให้ลงทะเบียนที่คีออสก์ หรือพนักงานเพิ่มรูปภาพใน **CourtPass Players** → รายละเอียดผู้เล่น",
};

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    return <span key={i}>{parts}{i < text.split("\n").length - 1 && <br />}</span>;
  });
}

export function AiChatWidget({ venueName }: { venueName?: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounter = useRef(0);

  const nextId = () => String(++idCounter.current);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const ui = UI[lang];
  const cached = lang === "vi" ? CACHED_VI : lang === "th" ? CACHED_TH : CACHED_EN;

  const handleQuickAction = (key: string) => {
    const actionLabel = ui.quickActions.find((a) => a.key === key)?.label || key;
    const userMsg: Message = { id: nextId(), role: "user", content: actionLabel };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    setTimeout(() => {
      const reply: Message = { id: nextId(), role: "assistant", content: cached[key] || "I'm not sure how to help with that." };
      setMessages((prev) => [...prev, reply]);
      setLoading(false);
    }, 800);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: nextId(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await api.post<{ reply: string }>("/api/ai-chat", { messages: history, language: lang });
      const reply: Message = { id: nextId(), role: "assistant", content: res.reply };
      setMessages((prev) => [...prev, reply]);
    } catch {
      const errMsg: Message = { id: nextId(), role: "assistant", content: lang === "vi" ? "Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại." : lang === "th" ? "ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" : "Sorry, something went wrong. Please try again." };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg shadow-indigo-900/30 transition-all hover:scale-105",
          open ? "bg-neutral-800 rotate-0" : "bg-indigo-600 hover:bg-indigo-500"
        )}
      >
        {open ? <X className="h-5 w-5 text-white" /> : <MessageCircle className="h-5 w-5 text-white" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[88px] right-6 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-[#2a2d3a] bg-[#0f1117] shadow-2xl shadow-black/40"
          style={{ height: 560 }}>

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[#2a2d3a] bg-[#161922] px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shrink-0">
              CF
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{ui.title}</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-neutral-400">{venueName || ui.subtitle}</span>
              </div>
            </div>
            <button
              onClick={() => setLang(lang === "en" ? "vi" : lang === "vi" ? "th" : "en")}
              className="flex items-center gap-1 rounded-lg border border-[#2a2d3a] bg-[#0f1117] px-2 py-1 text-[10px] font-medium text-neutral-400 hover:text-white transition-colors"
              title="Toggle language"
            >
              <Globe className="h-3 w-3" />
              {lang === "en" ? "EN" : lang === "vi" ? "VI" : "TH"}
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white mb-3">CF</div>
                <p className="text-sm font-medium text-white mb-1">{ui.title}</p>
                <p className="text-xs text-neutral-500">{ui.placeholder}</p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold mt-0.5",
                  msg.role === "user" ? "bg-indigo-600 text-white" : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                )}>
                  {msg.role === "user" ? "U" : "CF"}
                </div>
                <div className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-[#1a1d2a] text-neutral-300 rounded-tl-sm"
                )}>
                  {renderMarkdown(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-[9px] font-bold text-white mt-0.5">CF</div>
                <div className="rounded-xl bg-[#1a1d2a] px-4 py-3 rounded-tl-sm">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="border-t border-[#2a2d3a] px-3 pt-2 pb-1">
            <p className="text-[9px] font-medium uppercase tracking-wider text-neutral-600 mb-1.5">{ui.quickLabel}</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {ui.quickActions.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleQuickAction(action.key)}
                  disabled={loading}
                  className="shrink-0 rounded-full border border-[#2a2d3a] bg-[#161922] px-2.5 py-1 text-[10px] font-medium text-neutral-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-colors disabled:opacity-40"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-[#2a2d3a] p-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={ui.placeholder}
                className="flex-1 rounded-xl border border-[#2a2d3a] bg-[#161922] px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-indigo-500/50 focus:outline-none"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
