const STORAGE_KEY = "settai-expense-records-v1";

const csvHeaders = [
  "取引No",
  "取引日",
  "借方勘定科目",
  "借方補助科目",
  "借方税区分",
  "借方部門",
  "借方金額(円)",
  "貸方勘定科目",
  "貸方補助科目",
  "貸方税区分",
  "貸方部門",
  "貸方金額(円)",
  "摘要",
  "タグ",
  "メモ",
];

const creditAccounts = {
  現金: "現金",
  カード: "事業主借",
  その他: "その他",
};

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");
const amountInput = document.querySelector("#amount");
const placeInput = document.querySelector("#place");
const memoInput = document.querySelector("#memo");
const recordsBody = document.querySelector("#records-body");
const recordsCards = document.querySelector("#records-cards");
const recordsPanel = document.querySelector(".records-panel");
const countEl = document.querySelector("#count");
const totalEl = document.querySelector("#total");
const exportButton = document.querySelector("#export-csv");
const clearButton = document.querySelector("#clear-all");
const backupButton = document.querySelector("#backup-json");
const importInput = document.querySelector("#import-json");

let records = loadRecords();

dateInput.value = getLocalDateInputValue();
render();
registerServiceWorker();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const amount = Number(String(formData.get("amount")).replaceAll(",", ""));
  const payment = formData.get("payment");

  if (!dateInput.value || !Number.isFinite(amount) || amount <= 0 || !placeInput.value.trim()) {
    window.alert("日付、金額、場所を入力してください。");
    return;
  }

  records.push({
    transactionNo: getNextTransactionNo(),
    transactionDate: formatDateForCsv(dateInput.value),
    payment,
    amount: Math.round(amount),
    place: placeInput.value.trim(),
    memo: memoInput.value.trim(),
  });

  saveRecords();
  render();

  amountInput.value = "";
  placeInput.value = "";
  memoInput.value = "";
  amountInput.focus();
});

recordsBody.addEventListener("click", (event) => {
  handleDeleteClick(event);
});

recordsCards.addEventListener("click", (event) => {
  handleDeleteClick(event);
});

function handleDeleteClick(event) {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const transactionNo = Number(button.dataset.delete);
  if (!window.confirm(`取引No ${transactionNo} を削除しますか？`)) return;

  records = records.filter((record) => record.transactionNo !== transactionNo);
  saveRecords();
  render();
}

exportButton.addEventListener("click", () => {
  if (records.length === 0) {
    window.alert("出力するデータがありません。");
    return;
  }

  const csv = "\ufeff" + [
    csvHeaders.join(","),
    ...records.map((record) => csvHeaders.map((header) => escapeCsv(toCsvRow(record)[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `接待交際費_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

backupButton.addEventListener("click", () => {
  if (records.length === 0) {
    window.alert("バックアップするデータがありません。");
    return;
  }

  const backup = JSON.stringify({ version: 1, records }, null, 2);
  downloadFile(
    backup,
    `接待交際費バックアップ_${getCompactDate()}.json`,
    "application/json;charset=utf-8",
  );
});

importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const importedRecords = Array.isArray(data) ? data : data.records;
    if (!Array.isArray(importedRecords)) throw new Error("Invalid backup");

    records = importedRecords.map(normalizeRecord).filter(Boolean);
    saveRecords();
    render();
    window.alert("バックアップを復元しました。");
  } catch {
    window.alert("バックアップファイルを読み込めませんでした。");
  } finally {
    importInput.value = "";
  }
});

clearButton.addEventListener("click", () => {
  if (records.length === 0) return;
  if (!window.confirm("すべての入力履歴を削除しますか？")) return;
  records = [];
  saveRecords();
  render();
});

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getNextTransactionNo() {
  if (records.length === 0) return 1;
  return Math.max(...records.map((record) => record.transactionNo)) + 1;
}

function render() {
  recordsBody.innerHTML = records.map((record) => `
    <tr>
      <td class="number">${record.transactionNo}</td>
      <td class="date">${escapeHtml(record.transactionDate)}</td>
      <td class="payment">${escapeHtml(record.payment)}</td>
      <td class="amount">${formatYen(record.amount)}</td>
      <td>${escapeHtml(record.place)}</td>
      <td>${escapeHtml(record.memo)}</td>
      <td><button class="delete-row" type="button" data-delete="${record.transactionNo}">削除</button></td>
    </tr>
  `).join("");

  recordsCards.innerHTML = records.map((record) => `
    <article class="record-card">
      <div class="record-card__top">
        <span>No.${record.transactionNo}</span>
        <strong>${formatYen(record.amount)}</strong>
      </div>
      <div class="record-card__main">${escapeHtml(record.place)}</div>
      <dl>
        <div>
          <dt>日付</dt>
          <dd>${escapeHtml(record.transactionDate)}</dd>
        </div>
        <div>
          <dt>支払い</dt>
          <dd>${escapeHtml(record.payment)}</dd>
        </div>
      </dl>
      ${record.memo ? `<p>${escapeHtml(record.memo)}</p>` : ""}
      <button class="delete-row" type="button" data-delete="${record.transactionNo}">削除</button>
    </article>
  `).join("");

  recordsPanel.classList.toggle("is-empty", records.length === 0);
  countEl.textContent = String(records.length);
  totalEl.textContent = formatYen(records.reduce((sum, record) => sum + record.amount, 0));
}

function normalizeRecord(record) {
  const transactionNo = Number(record.transactionNo);
  const amount = Number(record.amount);
  if (!transactionNo || !amount || !record.transactionDate || !creditAccounts[record.payment]) {
    return null;
  }

  return {
    transactionNo,
    transactionDate: String(record.transactionDate),
    payment: record.payment,
    amount,
    place: String(record.place ?? ""),
    memo: String(record.memo ?? ""),
  };
}

function toCsvRow(record) {
  return {
    取引No: record.transactionNo,
    取引日: record.transactionDate,
    借方勘定科目: "接待交際費",
    借方補助科目: "",
    借方税区分: "",
    借方部門: "",
    "借方金額(円)": record.amount,
    貸方勘定科目: creditAccounts[record.payment],
    貸方補助科目: "",
    貸方税区分: "",
    貸方部門: "",
    "貸方金額(円)": record.amount,
    摘要: record.place,
    タグ: "",
    メモ: record.memo,
  };
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatYen(value) {
  return `${Number(value).toLocaleString("ja-JP")}円`;
}

function formatDateForCsv(value) {
  return value.replaceAll("-", "/");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getLocalDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCompactDate() {
  return getLocalDateInputValue().replaceAll("-", "");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
