"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Globe } from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api-client";

type Lang = "en" | "vi";

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
      { label: "Assign courts", key: "courts" },
      { label: "Process payment", key: "payment" },
      { label: "Add to queue", key: "queue" },
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
      { label: "Phân sân", key: "courts" },
      { label: "Xử lý thanh toán", key: "payment" },
      { label: "Thêm vào hàng chờ", key: "queue" },
      { label: "Lỗi nhận diện khuôn mặt", key: "face" },
    ],
  },
};

const CACHED_EN: Record<string, string> = {
  checkin: "To check in a player:\n1. Go to **CourtPay** in the left menu\n2. The camera activates at the check-in station\n3. Ask the player to look at the camera for face scan\n4. If face recognition fails, search by name or wristband number\n5. Confirm the wristband assignment\n6. The player automatically appears in the queue",
  membership: "To add a new membership:\n1. Go to **Memberships** in the menu\n2. Find the player in the list\n3. Click **Activate**\n4. Choose the membership tier (e.g. Silver Pro)\n5. Confirm billing information\n6. The member appears in the table",
  courts: "To assign courts:\n1. Go to **Live Sessions**\n2. The queue shows players by wristband number\n3. Drag a player into an empty court slot\n4. The TV display updates automatically\n5. You can also use auto-assign by skill level",
  payment: "To process a payment:\n1. Go to **CourtPay** or **CP Billing**\n2. Select the player or member\n3. Choose the service (court rental, shop item, membership)\n4. Confirm the amount and click **Charge**\n5. Check **CP Billing** for overdue invoices",
  queue: "To add a player to the queue:\n1. Complete check-in via **CourtPay** first\n2. After check-in, the player is automatically added to the queue\n3. View them in **Live Sessions**\n4. For manual add, use the **+** button and enter the wristband number",
  face: "If face recognition is not working:\n1. Ask the player to remove glasses and adjust lighting\n2. Retry — hold still for 2 seconds\n3. Click **Manual Search** and type the name\n4. Or enter the wristband number directly\n5. Go to **Face Recognition Test** to run diagnostics\n6. Check **Log Errors** if issues persist",
};

const CACHED_VI: Record<string, string> = {
  checkin: "Để điểm danh người chơi:\n1. Vào **CourtPay** ở menu bên trái\n2. Camera sẽ tự động bật tại trạm điểm danh\n3. Yêu cầu người chơi nhìn vào camera\n4. Nếu nhận diện khuôn mặt thất bại, tìm theo tên hoặc số vòng tay\n5. Xác nhận điểm danh và gán số vòng tay\n6. Người chơi tự động xuất hiện trong hàng chờ",
  membership: "Để thêm thành viên mới:\n1. Vào **Memberships**\n2. Tìm người chơi trong danh sách\n3. Nhấn nút **Activate**\n4. Chọn gói (ví dụ: Silver Pro)\n5. Xác nhận thông tin thanh toán\n6. Thành viên xuất hiện trong bảng",
  courts: "Để phân sân:\n1. Vào **Live Sessions**\n2. Hàng chờ hiển thị theo số vòng tay\n3. Kéo người chơi vào ô sân trống\n4. Màn hình TV cập nhật tự động\n5. Có thể dùng chế độ tự động phân theo trình độ",
  payment: "Để xử lý thanh toán:\n1. Vào **CourtPay** hoặc **CP Billing**\n2. Chọn người chơi hoặc thành viên\n3. Chọn dịch vụ (thuê sân, mua đồ, gói thành viên)\n4. Xác nhận số tiền và nhấn **Charge**\n5. Kiểm tra **CP Billing** để xem hóa đơn quá hạn",
  queue: "Để thêm người chơi vào hàng chờ:\n1. Hoàn tất điểm danh qua **CourtPay** trước\n2. Sau khi điểm danh người chơi tự vào hàng chờ\n3. Xem trong **Live Sessions**\n4. Thêm thủ công bằng nút **+** và nhập số vòng tay",
  face: "Nếu nhận diện khuôn mặt thất bại:\n1. Yêu cầu người chơi bỏ kính, điều chỉnh ánh sáng\n2. Thử lại, giữ 2 giây\n3. Nhấn **Tìm thủ công** và nhập tên\n4. Hoặc nhập trực tiếp số vòng tay\n5. Vào **Face Recognition Test** để chạy kiểm tra\n6. Kiểm tra **Log Errors** nếu lỗi tiếp tục",
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
  const cached = lang === "vi" ? CACHED_VI : CACHED_EN;

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
      const errMsg: Message = { id: nextId(), role: "assistant", content: lang === "vi" ? "Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại." : "Sorry, something went wrong. Please try again." };
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
              onClick={() => setLang(lang === "en" ? "vi" : "en")}
              className="flex items-center gap-1 rounded-lg border border-[#2a2d3a] bg-[#0f1117] px-2 py-1 text-[10px] font-medium text-neutral-400 hover:text-white transition-colors"
              title="Toggle language"
            >
              <Globe className="h-3 w-3" />
              {lang === "en" ? "EN" : "VI"}
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
