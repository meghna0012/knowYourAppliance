export function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function localIso(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function coverageLabel(type) {
  return (
    {
      manufacturer: "Manufacturer warranty",
      extended: "Extended warranty",
      retailer: "Retailer warranty",
      unknown: "Warranty",
    }[type] || "Warranty"
  );
}

export function termLabel(months) {
  if (!months) return "";
  if (months % 12 === 0) {
    const years = months / 12;
    return years === 1 ? "1 year" : `${years} years`;
  }
  return months === 1 ? "1 month" : `${months} months`;
}

export function intervalLabel(item) {
  if (!item) return "";
  if (item.intervalDays) {
    if (item.intervalDays % 7 === 0 && item.intervalDays < 70) {
      const weeks = item.intervalDays / 7;
      return weeks === 1 ? "every week" : `every ${weeks} weeks`;
    }
    return `every ${item.intervalDays} days`;
  }
  if (item.intervalMonths) {
    if (item.intervalMonths === 12) return "every year";
    if (item.intervalMonths % 12 === 0) {
      const years = item.intervalMonths / 12;
      return years === 1 ? "every year" : `every ${years} years`;
    }
    return item.intervalMonths === 1 ? "every month" : `every ${item.intervalMonths} months`;
  }
  return "";
}

export function priceLabel(purchase) {
  if (!purchase?.price) return "";
  if (purchase.currency && !String(purchase.price).toUpperCase().includes(purchase.currency)) {
    return `${purchase.currency} ${purchase.price}`;
  }
  return purchase.price;
}

export function statusLabel(status) {
  if (status === "overdue") return "Overdue";
  if (status === "due") return "Due";
  return "Upcoming";
}

export function careLine(appliance) {
  const active = (appliance.reminders || []).find(
    (item) => item.status === "overdue" || item.status === "due"
  );
  if (active) {
    return { alert: true, text: `${active.title} · ${formatDate(active.dueOn)}` };
  }

  const warranty = [...(appliance.records?.warranties || [])]
    .filter((item) => item.endDate)
    .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
  if (warranty) {
    return { alert: false, text: `Warranty until ${formatDate(warranty.endDate)}` };
  }

  const next = [...(appliance.records?.maintenance || [])]
    .filter((item) => item.nextDue)
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))[0];
  if (next) return { alert: false, text: `${next.task} · ${formatDate(next.nextDue)}` };
  return null;
}
