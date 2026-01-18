// === LOCAL STORAGE ===
const transactions = JSON.parse(localStorage.getItem("transactions")) || [];

// === FORMATTER ===
const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  signDisplay: "always",
});

// ANIMATION FUNCTION
function animateNumber(element, start, end, duration = 600) {
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const t = Math.min(elapsed / duration, 1);
    const progress = t * (2 - t);

    const value = start + (end - start) * progress;
    element.textContent = formatCurrency(value).replace(/^\+/, "");

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// === DOM ELEMENTY ===
const list = document.getElementById("transactionList");
const form = document.getElementById("transactionForm");
const balance = document.getElementById("balance");
const income = document.getElementById("income");
const expense = document.getElementById("expense");
const dateInput = document.getElementById("date");
const categoryInput = document.getElementById("categoryInput");
const categoryTextBack = document.getElementById("categoryTextBack");
const filterSelect = document.getElementById("filterCategory");
const themeToggle = document.getElementById("themeToggle");
const tabs = document.querySelectorAll(".tab-btn");
const transactionsTab = document.getElementById("transactionsTab");
const statsTab = document.getElementById("statsTab");
const statsButtons = document.querySelectorAll("#statsTab .tab-btn");
const expenseCanvas = document.getElementById("expenseChart");
const balanceCanvas = document.getElementById("balanceChart");
const undoToast = document.getElementById("undoToast");
const undoBtn = document.getElementById("undoBtn");
const budgetFill = document.getElementById("budgetFill");
const budgetText = document.getElementById("budgetText");

let balanceChartInstance;
let expenseChartInstance;
let lastDeleted = null;
let undoTimeout = null;
const budgetLimit = 1000;

// === UNDO TOAST HELPERS ===
function showUndoToast() {
  undoToast.classList.remove("hidden");
}
function hideUndoToast() {
  undoToast.classList.add("hidden");
}

// === UPDATE BUDGET BAR ===
function updateBudgetBar() {
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + t.amount, 0);

  const percent = Math.min((totalExpenses / budgetLimit) * 100, 100);

  budgetFill.style.width = percent + "%";

  if (percent < 75) budgetFill.style.backgroundColor = "yellowgreen";
  else if (percent < 100) budgetFill.style.backgroundColor = "orange";
  else budgetFill.style.backgroundColor = "red";

  budgetText.textContent = `$${totalExpenses.toFixed(
    2
  )} / $${budgetLimit} (${percent.toFixed(0)}%)`;
}

// === EVENTY ===
form.addEventListener("submit", addTransaction);

filterSelect.addEventListener("change", () => renderList(filterSelect.value));
themeToggle.addEventListener("click", toggleTheme);

// === STATS GRAPH SWITCHER ===
const mainTabs = document.querySelectorAll(".tab-btn[data-tab]");
const byTimeBtn = document.querySelector('.tab-btn[data-tab="time"]');

mainTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mainTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    // TRANSACTIONS
    if (tab.dataset.tab === "transactions") {
      transactionsTab.style.display = "block";
      statsTab.style.display = "none";

      byTimeBtn.classList.add("hidden");
      byTimeBtn.classList.remove("active");

      expenseCanvas.style.display = "none";
      balanceCanvas.style.display = "none";
    }

    // STATS (Pie chart)
    else if (tab.dataset.tab === "stats") {
      transactionsTab.style.display = "none";
      statsTab.style.display = "block";

      byTimeBtn.classList.remove("hidden");
      byTimeBtn.classList.remove("active");

      expenseCanvas.style.display = "block";
      balanceCanvas.style.display = "none";
      renderCategoryChart();
    }

    // BY TIME (Line chart)
    else if (tab.dataset.tab === "time") {
      transactionsTab.style.display = "none";
      statsTab.style.display = "block";

      mainTabs.forEach((t) => t.classList.remove("active"));
      byTimeBtn.classList.add("active");

      expenseCanvas.style.display = "none";
      balanceCanvas.style.display = "block";
      renderBalanceChart();
    }
  });
});

// === DARK MODE ===
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") document.body.classList.add("dark");
  else if (savedTheme === "light") document.body.classList.remove("dark");
  else if (window.matchMedia("(prefers-color-scheme: dark)").matches)
    document.body.classList.add("dark");

  updateToggleIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
  updateToggleIcon();
}

function updateToggleIcon() {
  themeToggle.textContent = document.body.classList.contains("dark")
    ? "☀️"
    : "🌙";
}
// === UTILITY ===
function formatCurrency(value) {
  if (value === 0) return formatter.format(0).replace(/^[+-]/, "");
  return formatter.format(value);
}

// === CREATE TRANSACTION ITEM ===
function createItem({ id, name, amount, date, type, category }) {
  const sign = type === "income" ? 1 : -1;

  const li = document.createElement("li");
  li.dataset.id = id;
  li.innerHTML = `
    <div class="name">
      <h4 class="editable name-text">${name}</h4>
      <p class="editable date-text">${new Date(date).toLocaleDateString()}</p>
      <p class="category-text">${category}</p>
    </div>
    <div class="right">
      <span class="editable amount-text ${type}">${formatCurrency(
    amount * sign
  )}</span>
      <button class="delete-btn" title="Delete">🗑️</button>
    </div>
  `;

  // DELETE
  li.querySelector(".delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("Delete this transaction?")) deleteTransaction(id);
  });

  enableEditing(li);

  return li;
}

// === TOTALS ===
function updateTotal() {
  const incomeTotal = transactions
    .filter((t) => t.type === "income")
    .reduce((acc, t) => acc + t.amount, 0);

  const expenseTotal = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + t.amount, 0);

  const balanceValue = incomeTotal - expenseTotal;

  const prevBalance = parseFloat(balance.dataset.value) || 0;
  const prevIncome = parseFloat(income.dataset.value) || 0;
  const prevExpense = parseFloat(expense.dataset.value) || 0;

  animateNumber(balance, prevBalance, balanceValue);
  animateNumber(income, prevIncome, incomeTotal);
  animateNumber(expense, prevExpense, expenseTotal * -1);

  balance.dataset.value = balanceValue;
  income.dataset.value = incomeTotal;
  expense.dataset.value = expenseTotal * -1;

  updateBudgetBar();
}

// === RENDER LIST ===
function renderList(filter = "all") {
  list.innerHTML = "";

  const filtered = transactions.filter((t) => {
    if (filter === "all") return true;

    if (filter === "income" || filter === "expense") {
      return t.type === filter;
    }

    return (t.category || "other").toLowerCase() === filter.toLowerCase();
  });

  const incomes = filtered
    .filter((t) => t.type === "income")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const expenses = filtered
    .filter((t) => t.type === "expense")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (incomes.length === 0 && expenses.length === 0) {
    list.dataset.placeholder = "No transactions.";
    return;
  }

  incomes.forEach((t) => list.appendChild(createItem(t)));
  expenses.forEach((t) => list.appendChild(createItem(t)));
}

function renderCategoryChart() {
  const categories = {};
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

  const data = {
    labels: Object.keys(categories),
    datasets: [
      {
        data: Object.values(categories),
        backgroundColor: [
          "#3a3dbe",
          "#5b5fff",
          "#ffd700",
          "#ff6347",
          "#00ced1",
          "#9acd32",
        ],
        borderColor: "#fff",
        borderWidth: 1,
      },
    ],
  };

  const ctx = document.getElementById("expenseChart").getContext("2d");

  if (expenseChartInstance) expenseChartInstance.destroy();

  expenseChartInstance = new Chart(ctx, {
    type: "pie",
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: document.body.classList.contains("dark")
              ? "#e4e6eb"
              : "#1d1f27",
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const val = context.raw;
              return `${context.label}: $${val.toFixed(2)}`;
            },
          },
        },
      },
    },
  });
}

function renderBalanceChart() {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  let runningBalance = 0;
  const labels = [];
  const data = [];

  sorted.forEach((t) => {
    runningBalance += t.type === "income" ? t.amount : -t.amount;
    labels.push(new Date(t.date).toLocaleDateString());
    data.push(runningBalance);
  });

  const ctx = balanceCanvas.getContext("2d");

  if (balanceChartInstance) balanceChartInstance.destroy();

  balanceChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Balance",
          data,
          tension: 0.3,
          fill: true,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: document.body.classList.contains("dark")
              ? "#e4e6eb"
              : "#1d1f27",
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: document.body.classList.contains("dark")
              ? "#e4e6eb"
              : "#1d1f27",
          },
        },
        y: {
          ticks: {
            color: document.body.classList.contains("dark")
              ? "#e4e6eb"
              : "#1d1f27",
          },
        },
      },
    },
  });
}

// === DELETE ===
function deleteTransaction(id) {
  const index = transactions.findIndex((t) => t.id === id);
  if (index === -1) return;

  lastDeleted = {
    transaction: transactions[index],
    index,
  };

  transactions.splice(index, 1);
  renderList(filterSelect.value);
  updateTotal();

  showUndoToast();

  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    lastDeleted = null;
    saveTransactions();
    hideUndoToast();
  }, 5000);
}

// === UNDO HANDLER ===
undoBtn.addEventListener("click", () => {
  if (!lastDeleted) return;

  transactions.splice(lastDeleted.index, 0, lastDeleted.transaction);

  lastDeleted = null;
  saveTransactions();
  renderList(filterSelect.value);
  updateTotal();
  hideUndoToast();
});

// === ADD TRANSACTION ===
function addTransaction(e) {
  e.preventDefault();

  const isExpense = document.getElementById("type").checked;
  const uniqueId =
    Date.now().toString(36) + Math.random().toString(36).substring(2);

  const newTransaction = {
    id: uniqueId,
    name: form.name.value.trim(),
    amount: Math.abs(parseFloat(form.amount.value)),
    date: new Date(form.date.value),
    type: isExpense ? "expense" : "income",
    category: categoryInput.value.trim().toLowerCase() || "other",
  };

  if (
    !newTransaction.name ||
    !newTransaction.amount ||
    !form.date.value ||
    !newTransaction.category
  ) {
    alert("Please fill in name, amount, date and category.");
    return;
  }

  transactions.push(newTransaction);
  saveTransactions();
  renderList(filterSelect.value);
  updateTotal();
  form.reset();

  if (statsTab.style.display === "block") {
    renderCategoryChart();
    renderBalanceChart();
  }
}

// === SAVE ===
function saveTransactions() {
  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  localStorage.setItem("transactions", JSON.stringify(transactions));
}

// === EDITING ===
function enableEditing(li) {
  const id = li.dataset.id;
  const transaction = transactions.find((t) => t.id === id);

  // NAME
  li.querySelector(".name-text").addEventListener("click", function () {
    const input = document.createElement("input");
    input.type = "text";
    input.value = transaction.name;
    this.replaceWith(input);
    input.focus();
    input.addEventListener("blur", () => {
      transaction.name = input.value || transaction.name;
      saveTransactions();
      renderList(filterSelect.value);

      if (statsTab.style.display === "block") {
        renderCategoryChart();
        renderBalanceChart();
      }
    });
  });

  // AMOUNT
  li.querySelector(".amount-text").addEventListener("click", function () {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = transaction.amount;
    this.replaceWith(input);
    input.focus();
    input.addEventListener("blur", () => {
      transaction.amount =
        Math.abs(parseFloat(input.value)) || transaction.amount;
      saveTransactions();
      updateTotal();
      renderList(filterSelect.value);

      if (statsTab.style.display === "block") {
        renderCategoryChart();
        renderBalanceChart();
      }
    });
  });

  // DATE
  li.querySelector(".date-text").addEventListener("click", function () {
    const input = document.createElement("input");
    input.type = "date";
    input.value = new Date(transaction.date).toISOString().split("T")[0];
    this.replaceWith(input);
    input.focus();
    input.addEventListener("blur", () => {
      transaction.date = new Date(input.value);
      saveTransactions();
      renderList(filterSelect.value);

      if (statsTab.style.display === "block") {
        renderCategoryChart();
        renderBalanceChart();
      }
    });
  });

  // CATEGORY EDIT
  li.querySelector(".category-text").addEventListener("click", function () {
    const input = document.createElement("input");
    input.type = "text";
    input.value = transaction.category;
    this.replaceWith(input);
    input.focus();
    input.addEventListener("blur", () => {
      transaction.category = input.value.trim() || "other";
      saveTransactions();
      renderList(filterSelect.value);

      if (statsTab.style.display === "block") {
        renderCategoryChart();
        renderBalanceChart();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
  });
}

// === INITIAL RENDER ===
initTheme();
renderList();
updateTotal();
