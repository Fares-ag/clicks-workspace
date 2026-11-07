/**
 * Every customer-facing event the platform sends, with its inbox type and the
 * copy shown in the inbox, the push and the in-app banner. One table, so the
 * inbox, the push and the socket can never disagree (scenario 73).
 *
 * `inbox: false` events are realtime-only (high-frequency or self-initiated):
 * they go to the customer's socket room and nowhere else.
 */

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function clip(text, max = 140) {
  const s = String(text || "").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function technicianName(data = {}) {
  const t = data.technician;
  if (t && typeof t === "object") {
    if (t.name) return String(t.name).trim();
    const full = `${t.firstName || ""} ${t.lastName || ""}`.trim();
    if (full) return full;
  }
  return String(data.technician_name || "").trim();
}

const CUSTOMER_EVENTS = {
  technicianAssigned: {
    type: "technician_assigned",
    copy: (d) => {
      const name = technicianName(d);
      return {
        title: "Technician assigned",
        body: name
          ? `${name} has been assigned to your request.`
          : "A technician has been assigned to your request.",
        title_ar: "تم تعيين فني",
        body_ar: name ? `تم تعيين ${name} لطلبك.` : "تم تعيين فني لطلبك.",
      };
    },
  },
  technicianAccepted: {
    type: "technician_accepted",
    copy: (d) => {
      const name = technicianName(d);
      return {
        title: "Technician confirmed",
        body: name ? `${name} accepted your job.` : "Your technician accepted the job.",
        title_ar: "تم تأكيد الفني",
        body_ar: "قبل الفني طلبك.",
      };
    },
  },
  jobReassigning: {
    type: "job_reassigning",
    copy: () => ({
      title: "Finding another technician",
      body: "Your technician couldn't continue. We're finding another technician for you.",
      title_ar: "نبحث عن فني آخر",
      body_ar: "لم يتمكن الفني من المتابعة. نبحث لك عن فني آخر.",
    }),
  },
  technicianEnRoute: {
    type: "en_route",
    copy: () => ({
      title: "On the way",
      body: "Your technician is heading to your location.",
      title_ar: "في الطريق",
      body_ar: "الفني في طريقه إلى موقعك.",
    }),
  },
  technicianArrived: {
    type: "arrived",
    copy: () => ({
      title: "Technician arrived",
      body: "Your technician has arrived at your location.",
      title_ar: "وصل الفني",
      body_ar: "وصل الفني إلى موقعك.",
    }),
  },
  jobStarted: {
    type: "in_progress",
    copy: () => ({
      title: "Service started",
      body: "Your technician has started working on your vehicle.",
      title_ar: "بدأت الخدمة",
      body_ar: "بدأ الفني العمل على سيارتك.",
    }),
  },
  jobOnHold: {
    type: "job_on_hold",
    copy: (d) => {
      const reason = clip(d.hold_reason || d.reason, 120);
      return {
        title: "Your job is paused",
        body: reason
          ? `Our team paused your job: ${reason}`
          : "Our team paused your job. We'll update you as soon as it resumes.",
        title_ar: "تم إيقاف طلبك مؤقتاً",
        body_ar: reason ? `أوقف فريقنا طلبك مؤقتاً: ${reason}` : "أوقف فريقنا طلبك مؤقتاً وسنبلغك عند استئنافه.",
      };
    },
  },
  jobResumed: {
    type: "job_resumed",
    copy: () => ({
      title: "Your job has resumed",
      body: "Your technician is back on your job.",
      title_ar: "تم استئناف طلبك",
      body_ar: "عاد الفني إلى العمل على طلبك.",
    }),
  },
  jobAtGarage: {
    type: "job_at_garage",
    copy: (d) => {
      const garage = clip(d.garage?.name || d.garage_name, 80);
      return {
        title: "Your car is at the garage",
        body: garage
          ? `Your car was taken to ${garage}. We'll tell you when it's ready.`
          : "Your car was taken to the garage. We'll tell you when it's ready.",
        title_ar: "سيارتك في الورشة",
        body_ar: "تم نقل سيارتك إلى الورشة وسنبلغك عندما تصبح جاهزة.",
      };
    },
  },
  jobGarageReady: {
    type: "job_garage_ready",
    copy: () => ({
      title: "Your car is ready",
      body: "The garage has finished. Your technician is bringing your car back.",
      title_ar: "سيارتك جاهزة",
      body_ar: "انتهت الورشة من العمل والفني في طريقه بسيارتك.",
    }),
  },
  jobCompleted: {
    type: "job_completed",
    copy: () => ({
      title: "Service complete",
      body: "Your service has been completed. Thank you for using Clicks!",
      title_ar: "اكتملت الخدمة",
      body_ar: "تم إكمال خدمتك. شكراً لاستخدامك كليكس!",
    }),
  },
  jobCancelled: {
    type: "job_cancelled",
    copy: (d) => {
      const by = String(d.cancelled_by || "");
      let body = "Your service request was cancelled.";
      if (by === "admin") body = "Our team cancelled your service request.";
      if (by === "customer") body = "You cancelled your service request.";
      if (by === "technician") body = "Your technician cancelled the job.";
      return {
        title: "Job cancelled",
        body,
        title_ar: "تم إلغاء الطلب",
        body_ar: "تم إلغاء طلب الخدمة.",
      };
    },
  },
  paymentConfirmed: {
    type: "payment_received",
    copy: (d) => {
      const amount = money(d.amount ?? d.paid_amount ?? d.total_amount);
      return {
        title: "Payment received",
        body: amount != null ? `Payment of QAR ${amount} confirmed. Thank you!` : "Payment confirmed. Thank you!",
        title_ar: "تم استلام الدفع",
        body_ar: amount != null ? `تم تأكيد دفع ${amount} ر.ق. شكراً لك!` : "تم تأكيد الدفع. شكراً لك!",
      };
    },
  },
  refundProcessed: {
    type: "refund_processed",
    copy: (d) => {
      const amount = money(d.amount);
      return {
        title: "Refund processed",
        body: amount != null
          ? `We refunded QAR ${amount}. It can take a few days to reach your account.`
          : "Your refund was processed. It can take a few days to reach your account.",
        title_ar: "تم رد المبلغ",
        body_ar: "تمت معالجة استرداد المبلغ وقد يستغرق وصوله بضعة أيام.",
      };
    },
  },
  sosInCall: {
    type: "sos_update",
    copy: () => ({
      title: "Clicks support",
      body: "An operator is reviewing your request and will call you shortly.",
      title_ar: "دعم كليكس",
      body_ar: "يراجع أحد موظفينا طلبك وسيتصل بك قريباً.",
    }),
  },
  sosStillConnecting: {
    type: "sos_still_connecting",
    copy: () => ({
      title: "Still connecting you",
      body: "We're still connecting you to an operator. Tap to call us now.",
      title_ar: "ما زلنا نوصلك",
      body_ar: "ما زلنا نوصلك بأحد موظفينا. اضغط للاتصال بنا الآن.",
    }),
  },
  sosScheduled: {
    type: "sos_scheduled",
    copy: () => ({
      title: "Booking scheduled",
      body: "Your request was booked as a scheduled service.",
      title_ar: "تمت جدولة الحجز",
      body_ar: "تم تحويل طلبك إلى خدمة مجدولة.",
    }),
  },
  sosClosed: {
    type: "sos_closed",
    copy: () => ({
      title: "Request closed",
      body: "Our team closed your request. Contact us if you still need help.",
      title_ar: "تم إغلاق الطلب",
      body_ar: "أغلق فريقنا طلبك. تواصل معنا إذا كنت ما زلت بحاجة للمساعدة.",
    }),
  },
  sosExpired: {
    type: "sos_expired",
    copy: (d) => ({
      title: "Request expired",
      body: clip(d.message, 160) || "No operator picked up your request in time. Please try again or call us.",
      title_ar: "انتهت صلاحية الطلب",
      body_ar: "لم يستلم أحد طلبك في الوقت المحدد. حاول مرة أخرى أو اتصل بنا.",
    }),
  },
  supportTicketReceived: {
    type: "support_ticket_received",
    copy: (d) => ({
      title: "We received your request",
      body: d.ticket_number
        ? `Ticket ${d.ticket_number}. Our team will reply here.`
        : "Our team will reply here.",
      title_ar: "استلمنا طلبك",
      body_ar: "سيرد فريقنا عليك هنا.",
    }),
  },
  supportTicketReply: {
    type: "support_ticket_reply",
    copy: (d) => ({
      title: d.ticket_number ? `Reply on ticket ${d.ticket_number}` : "Support replied",
      body: clip(d.message, 160) || "Clicks Support replied to your request.",
      title_ar: "رد على طلبك",
      body_ar: "رد فريق دعم كليكس على طلبك.",
    }),
  },
  supportTicketStatus: {
    type: "support_ticket_status",
    copy: (d) => ({
      title: d.ticket_number ? `Ticket ${d.ticket_number} updated` : "Ticket updated",
      body: d.status ? `Status: ${String(d.status).replace(/_/g, " ")}` : "Your request was updated.",
      title_ar: "تم تحديث طلبك",
      body_ar: "تم تحديث حالة طلبك.",
    }),
  },
};

/** Realtime-only: socket room, no inbox row, no push. */
const REALTIME_ONLY_EVENTS = new Set([
  "locationUpdate",
  "sosCreated",
  "sosCancelled",
  "jobStatusUpdated",
]);

function customerEventSpec(event) {
  return CUSTOMER_EVENTS[event] || null;
}

function customerCopyForEvent(event, data = {}) {
  const spec = customerEventSpec(event);
  if (!spec) {
    return {
      title: "Clicks",
      body: "You have a new update on your request.",
      title_ar: "كليكس",
      body_ar: "لديك تحديث جديد على طلبك.",
    };
  }
  return spec.copy(data || {});
}

function customerTypeForEvent(event) {
  return customerEventSpec(event)?.type || String(event || "update");
}

module.exports = {
  CUSTOMER_EVENTS,
  CUSTOMER_EVENT_NAMES: Object.freeze(Object.keys(CUSTOMER_EVENTS)),
  REALTIME_ONLY_EVENTS,
  customerEventSpec,
  customerCopyForEvent,
  customerTypeForEvent,
};
