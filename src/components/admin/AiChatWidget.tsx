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
  checkin: "To check in a player (CourtPay kiosk or mobile app):\n1. Go to **CourtPay** in the left menu\n2. Select the venue\n3. The camera activates — ask the player to look at the camera\n4. If face recognition fails, tap **Manual Search** and search by name or phone\n5. Confirm the check-in — a VietQR payment QR is generated automatically\n6. If auto-payment (Sepay) is enabled, payment confirms without staff action",
  membership: "To activate a new membership:\n1. Go to **Memberships** in the left menu\n2. Select the venue\n3. Click the green **Activate** button (top right)\n4. Search for the player by name in the modal\n5. Select the player from the results\n6. Choose the membership tier from the dropdown\n7. Click **Activate** — the member appears in the table",
  bookings: "To manage court bookings:\n1. Go to **Bookings** in the left menu\n2. Select the venue — the Day Planner grid shows courts as columns and time slots as rows\n3. Click an available slot to create a booking, or click an existing booking to edit/cancel it\n4. Use the date arrows to navigate days\n5. Blocked slots (Open Play, Competition, Private Event, Maintenance) appear as colored blocks\n6. Go to **Schedule** tab to configure recurring weekly sessions\n7. Go to **Pricing** tab to set per-day/hour pricing rules",
  courts: "To monitor live courts and queues:\n1. Go to **Live** in the left menu\n2. Select the venue — you can see all courts and the current queue in real time\n3. Court assignments happen from the **Staff Dashboard** (not Admin): staff drag players from the queue into court slots\n4. The **TV Display** at the venue also updates automatically via WebSocket\n5. Sessions are opened and closed from the **CourtPay mobile app** (Session tab)",
  payment: "To track and confirm payments:\n1. For **CourtPay** session payments: go to **CourtPay** → select venue → view pending/confirmed/cancelled payments\n2. For **membership** payments: go to **Memberships** → click a member → open Payment History drawer → mark as paid with method and amount\n3. For **CourtPay analytics and exports**: go to **CourtPay Analytics** → select venue → drill down by month/week/session → export CSV\n4. For **billing invoices** (superadmin): go to **CP Billing** → mark invoices as paid\n5. If Sepay auto-payment is ON, bank transfers confirm automatically — check **CourtPay Settings → Auto-payment** to verify",
  face: "If face recognition is not working:\n1. Ask the player to remove glasses, face the camera directly, and ensure good lighting\n2. Retry — hold still for 2 seconds\n3. Tap **Manual Search** and type the player's name or phone number\n4. To run a system-level test: go to **Face Recognition Test** in the left menu (Logs & Errors section)\n5. Check **Log Errors** for any AWS Rekognition errors\n6. If a player's face is not registered, they need to enroll at the kiosk or staff can add their photo in **CP Players** → player detail",
};

const CACHED_VI: Record<string, string> = {
  checkin: "Để điểm danh người chơi (kiosk CourtPay hoặc ứng dụng di động):\n1. Vào **CourtPay** ở menu bên trái\n2. Chọn venue\n3. Camera tự bật — yêu cầu người chơi nhìn vào camera\n4. Nếu nhận diện khuôn mặt thất bại, nhấn **Tìm thủ công** và tìm theo tên hoặc số điện thoại\n5. Xác nhận điểm danh — mã QR VietQR được tạo tự động\n6. Nếu bật tự động xác nhận (Sepay), thanh toán được xác nhận mà không cần thao tác của nhân viên",
  membership: "Để kích hoạt thành viên mới:\n1. Vào **Memberships** ở menu bên trái\n2. Chọn venue\n3. Nhấn nút **Activate** màu xanh lá (góc trên bên phải)\n4. Tìm kiếm người chơi theo tên trong hộp thoại\n5. Chọn người chơi từ kết quả\n6. Chọn gói thành viên từ danh sách\n7. Nhấn **Activate** — thành viên xuất hiện trong bảng",
  bookings: "Để quản lý đặt sân:\n1. Vào **Bookings** ở menu bên trái\n2. Chọn venue — lưới Day Planner hiển thị sân theo cột và khung giờ theo hàng\n3. Nhấn ô trống để tạo đặt sân, hoặc nhấn vào đặt sân hiện có để sửa/hủy\n4. Dùng mũi tên ngày để điều hướng\n5. Ô bị khóa (Open Play, Competition, Private Event, Maintenance) hiển thị dạng khối màu\n6. Vào tab **Schedule** để cấu hình lịch hàng tuần định kỳ\n7. Vào tab **Pricing** để đặt quy tắc giá theo ngày/giờ",
  courts: "Để theo dõi sân và hàng chờ theo thời gian thực:\n1. Vào **Live** ở menu bên trái\n2. Chọn venue — xem tất cả sân và hàng chờ hiện tại\n3. Phân sân được thực hiện từ **Staff Dashboard** (không phải Admin): nhân viên kéo người chơi từ hàng chờ vào ô sân\n4. **TV Display** tại venue cũng cập nhật tự động qua WebSocket\n5. Mở và đóng phiên từ **ứng dụng di động CourtPay** (tab Session)",
  payment: "Để theo dõi và xác nhận thanh toán:\n1. Thanh toán phiên **CourtPay**: vào **CourtPay** → chọn venue → xem thanh toán chờ/đã xác nhận/đã hủy\n2. Thanh toán **thành viên**: vào **Memberships** → nhấn vào thành viên → mở ngăn Lịch sử thanh toán → đánh dấu đã thanh toán kèm phương thức và số tiền\n3. **Phân tích và xuất dữ liệu CourtPay**: vào **CourtPay Analytics** → chọn venue → xem chi tiết theo tháng/tuần/phiên → xuất CSV\n4. **Hóa đơn thanh toán** (superadmin): vào **CP Billing** → đánh dấu hóa đơn đã thanh toán\n5. Nếu bật Sepay tự động, chuyển khoản ngân hàng được xác nhận tự động — kiểm tra **CourtPay Settings → Auto-payment**",
  face: "Nếu nhận diện khuôn mặt thất bại:\n1. Yêu cầu người chơi bỏ kính, nhìn thẳng vào camera và đảm bảo ánh sáng tốt\n2. Thử lại — giữ yên 2 giây\n3. Nhấn **Tìm thủ công** và nhập tên hoặc số điện thoại\n4. Để chạy kiểm tra hệ thống: vào **Face Recognition Test** ở menu bên trái (phần Logs & Errors)\n5. Kiểm tra **Log Errors** để xem lỗi AWS Rekognition\n6. Nếu người chơi chưa đăng ký khuôn mặt, họ cần đăng ký tại kiosk hoặc nhân viên thêm ảnh trong **CP Players** → chi tiết người chơi",
};

const CACHED_TH: Record<string, string> = {
  checkin: "วิธีเช็คอินผู้เล่น (คีออสก์ CourtPay หรือแอปมือถือ):\n1. ไปที่ **CourtPay** ในเมนูซ้าย\n2. เลือกสถานที่\n3. กล้องจะเปิดขึ้น — ให้ผู้เล่นมองที่กล้อง\n4. หากจดจำใบหน้าไม่ได้ ให้แตะ **ค้นหาด้วยตนเอง** แล้วค้นหาตามชื่อหรือเบอร์โทร\n5. ยืนยันการเช็คอิน — ระบบสร้าง QR VietQR สำหรับชำระเงินโดยอัตโนมัติ\n6. หากเปิดใช้งานการชำระเงินอัตโนมัติ (Sepay) การโอนเงินจะยืนยันโดยไม่ต้องให้พนักงานดำเนินการ",
  membership: "วิธีเปิดใช้งานสมาชิกใหม่:\n1. ไปที่ **Memberships** ในเมนูซ้าย\n2. เลือกสถานที่\n3. คลิกปุ่ม **Activate** สีเขียว (มุมขวาบน)\n4. ค้นหาผู้เล่นตามชื่อในหน้าต่างที่เปิดขึ้น\n5. เลือกผู้เล่นจากรายการผลลัพธ์\n6. เลือกระดับสมาชิกจากเมนูแบบเลื่อนลง\n7. คลิก **Activate** — สมาชิกจะปรากฏในตาราง",
  bookings: "วิธีจัดการการจองสนาม:\n1. ไปที่ **Bookings** ในเมนูซ้าย\n2. เลือกสถานที่ — ตาราง Day Planner แสดงสนามเป็นคอลัมน์และช่วงเวลาเป็นแถว\n3. คลิกช่องว่างเพื่อสร้างการจอง หรือคลิกการจองที่มีอยู่เพื่อแก้ไข/ยกเลิก\n4. ใช้ลูกศรเพื่อเปลี่ยนวัน\n5. ช่องที่ถูกบล็อก (Open Play, Competition, Private Event, Maintenance) แสดงเป็นบล็อกสี\n6. ไปที่แท็บ **Schedule** เพื่อตั้งค่าตารางประจำสัปดาห์\n7. ไปที่แท็บ **Pricing** เพื่อตั้งกฎราคาตามวัน/เวลา",
  courts: "วิธีติดตามสนามและคิวแบบเรียลไทม์:\n1. ไปที่ **Live** ในเมนูซ้าย\n2. เลือกสถานที่ — ดูสนามทั้งหมดและคิวปัจจุบัน\n3. การจัดสรรสนามทำจาก **Staff Dashboard** (ไม่ใช่ Admin): พนักงานลากผู้เล่นจากคิวไปยังช่องสนาม\n4. **TV Display** ที่สถานที่ก็อัปเดตอัตโนมัติผ่าน WebSocket\n5. เปิดและปิดเซสชันจาก **แอป CourtPay บนมือถือ** (แท็บ Session)",
  payment: "วิธีติดตามและยืนยันการชำระเงิน:\n1. การชำระเงินเซสชัน **CourtPay**: ไปที่ **CourtPay** → เลือกสถานที่ → ดูการชำระเงินที่รอ/ยืนยันแล้ว/ยกเลิก\n2. การชำระเงิน **สมาชิก**: ไปที่ **Memberships** → คลิกสมาชิก → เปิดประวัติการชำระเงิน → ทำเครื่องหมายว่าชำระแล้วพร้อมวิธีและจำนวนเงิน\n3. **วิเคราะห์และส่งออก CourtPay**: ไปที่ **CourtPay Analytics** → เลือกสถานที่ → ดูรายละเอียดตามเดือน/สัปดาห์/เซสชัน → ส่งออก CSV\n4. **ใบแจ้งหนี้** (superadmin): ไปที่ **CP Billing** → ทำเครื่องหมายว่าชำระแล้ว\n5. หากเปิด Sepay อัตโนมัติ การโอนเงินจะยืนยันอัตโนมัติ — ตรวจสอบที่ **CourtPay Settings → Auto-payment**",
  face: "หากการจดจำใบหน้าไม่ทำงาน:\n1. ให้ผู้เล่นถอดแว่น หันหน้าตรงไปที่กล้อง และตรวจสอบให้แน่ใจว่ามีแสงเพียงพอ\n2. ลองใหม่ — หยุดนิ่ง 2 วินาที\n3. แตะ **ค้นหาด้วยตนเอง** แล้วพิมพ์ชื่อหรือเบอร์โทร\n4. เพื่อรันการทดสอบระบบ: ไปที่ **Face Recognition Test** ในเมนูซ้าย (ส่วน Logs & Errors)\n5. ตรวจสอบ **Log Errors** เพื่อดูข้อผิดพลาด AWS Rekognition\n6. หากผู้เล่นยังไม่ได้ลงทะเบียนใบหน้า ให้ลงทะเบียนที่คีออสก์ หรือพนักงานเพิ่มรูปภาพใน **CP Players** → รายละเอียดผู้เล่น",
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
