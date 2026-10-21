/**
 * محفظتي الذكية (Smart E-Wallet) - تطبيق تنظيم وتتبع المصروف الشخصي
 * يشمل دعم التراكم والترحيل التلقائي للأيام التي لم يتم الصرف فيها،
 * وتسجيل المصاريف بأثر رجعي مع إمكانية التعديل والحذف.
 */

// التصنيفات الافتراضية
const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'طعام ووجبات', icon: '🍔', color: '#f97316' },
  { id: 'coffee', name: 'كافيهات ومشروبات', icon: '☕', color: '#8b5cf6' },
  { id: 'transport', name: 'مواصلات وبنزين', icon: '🚗', color: '#0ea5e9' },
  { id: 'groceries', name: 'سوبرماركت وطلبات', icon: '🛒', color: '#10b981' },
  { id: 'entertainment', name: 'خروج وترفيه', icon: '🎮', color: '#ec4899' },
  { id: 'shopping', name: 'تسوق ومشتريات', icon: '🛍️', color: '#f59e0b' },
  { id: 'health', name: 'صحة وصيدلية', icon: '💊', color: '#ef4444' },
  { id: 'bills', name: 'رصيد وإنترنت', icon: '📱', color: '#6366f1' },
  { id: 'other', name: 'مصاريف أخرى', icon: '💡', color: '#64748b' }
];

// الحالة العامة للتطبيق
const AppState = {
  budget: 0,
  currency: 'ج.م',
  cycleType: 'monthly', // 'monthly' | 'salary_day' | 'custom_days'
  salaryDay: 1,         // اليوم الذي يبدأ فيه الشهر المالي (مثلاً يوم 1 أو 25)
  customStartDate: '',
  customDaysCount: 30,
  expenses: [],
  categories: [...DEFAULT_CATEGORIES],
  theme: 'light'
};

const STORAGE_KEY = 'smart_ewallet_store_v1';

// تهيئة التطبيق عند اكتمال تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  renderCategorySelector();
  setupEventListeners();
  initTheme();
  
  // ضبط حقل التاريخ الافتراضي لليوم الحالي
  setExpenseDateOffset(0);

  // إذا كانت الميزانية صفر، نفتح نافذة إعداد الميزانية للمستخدم لأول مرة
  if (!AppState.budget || AppState.budget <= 0) {
    openBudgetModal(true);
  }

  renderAll();

  // تفعيل المزامنة السحابية اللحظية مع Firebase
  if (typeof initFirebaseSync === 'function') {
    initFirebaseSync();
  }
});

/**
 * حفظ واسترجاع البيانات من LocalStorage
 */
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState));
    if (typeof pushLocalDataToCloud === 'function') {
      pushLocalDataToCloud();
    }
  } catch (e) {
    console.error('Error saving data to LocalStorage:', e);
  }
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      AppState.budget = Number(data.budget) || 0;
      AppState.currency = data.currency || 'ج.م';
      AppState.cycleType = data.cycleType || 'monthly';
      AppState.salaryDay = Number(data.salaryDay) || 1;
      AppState.customStartDate = data.customStartDate || '';
      AppState.customDaysCount = Number(data.customDaysCount) || 30;
      AppState.expenses = Array.isArray(data.expenses) ? data.expenses : [];
      AppState.theme = data.theme || 'light';
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        AppState.categories = data.categories;
      }
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
}

/**
 * دالة مساعدة لتاريخ اليوم بتنسيق YYYY-MM-DD
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * تحديد تاريخ الإدخال السريع (اليوم، أمس، أول أمس، إلخ)
 */
window.setExpenseDateOffset = function(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const dateInput = document.getElementById('expenseDate');
  if (dateInput) {
    dateInput.value = dateStr;
  }

  // تحديث الزر النشط
  document.querySelectorAll('.btn-quick-date').forEach(btn => {
    const daysAgo = parseInt(btn.getAttribute('data-days-ago'), 10);
    if (daysAgo === offsetDays) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

/**
 * حساب حدود الدورة المالية الحالية (تاريخ البداية والنهاية وإجمالي الأيام والأيام المتبقية)
 */
function calculateCycleInfo() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let startDate, endDate;

  if (AppState.cycleType === 'custom_days' && AppState.customStartDate) {
    const [sy, sm, sd] = AppState.customStartDate.split('-').map(Number);
    startDate = new Date(sy, sm - 1, sd);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (AppState.customDaysCount - 1));
  } else if (AppState.cycleType === 'salary_day') {
    const sDay = AppState.salaryDay || 1;
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    if (today.getDate() >= sDay) {
      startDate = new Date(currentYear, currentMonth, sDay);
      endDate = new Date(currentYear, currentMonth + 1, sDay - 1);
    } else {
      startDate = new Date(currentYear, currentMonth - 1, sDay);
      endDate = new Date(currentYear, currentMonth, sDay - 1);
    }
  } else {
    // التقويم الشهري العادي (من يوم 1 إلى نهاية الشهر)
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    startDate = new Date(currentYear, currentMonth, 1);
    endDate = new Date(currentYear, currentMonth + 1, 0);
  }

  // حساب الأيام
  const oneDayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(1, Math.round((endDate - startDate) / oneDayMs) + 1);

  // الأيام المنقضية حتى اليوم شاملة اليوم الحالي
  let daysPassedToDate = 1;
  if (today < startDate) {
    daysPassedToDate = 1;
  } else if (today > endDate) {
    daysPassedToDate = totalDays;
  } else {
    daysPassedToDate = Math.max(1, Math.min(totalDays, Math.round((today - startDate) / oneDayMs) + 1));
  }

  // الأيام المتبقية (شاملة اليوم الحالي)
  let remainingDays = 0;
  if (today > endDate) {
    remainingDays = 0;
  } else if (today < startDate) {
    remainingDays = totalDays;
  } else {
    remainingDays = Math.max(1, Math.round((endDate - today) / oneDayMs) + 1);
  }

  return {
    startDate,
    endDate,
    totalDays,
    daysPassedToDate,
    remainingDays,
    startDateStr: startDate.toISOString().split('T')[0],
    endDateStr: endDate.toISOString().split('T')[0]
  };
}

/**
 * الحسابات المالية الدقيقة (شاملة التراكم والترحيل للأيام التي لم يتم الصرف فيها)
 */
function getBudgetCalculations() {
  const cycle = calculateCycleInfo();
  const todayStr = getTodayDateString();

  // تصفية المصاريف التي تخص الدورة الحالية فقط
  const cycleExpenses = AppState.expenses.filter(exp => {
    return exp.date >= cycle.startDateStr && exp.date <= cycle.endDateStr;
  });

  // إجمالي الصرف خلال الدورة
  const totalSpent = cycleExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // الرصيد الكلي المتبقي
  const remainingBudget = AppState.budget - totalSpent;

  // المصاريف السابقة المنصرفة قبل تاريخ اليوم
  const pastExpenses = cycleExpenses.filter(exp => exp.date < todayStr);
  const spentBeforeToday = pastExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // ما تم صرفه اليوم تحديداً
  const todayExpenses = cycleExpenses.filter(exp => exp.date === todayStr);
  const spentToday = todayExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // 1. المعدل اليومي الأساسي (الميزانية الكلية / إجمالي الأيام)
  const baseDailyAllowance = cycle.totalDays > 0 ? (AppState.budget / cycle.totalDays) : 0;

  // 2. الرصيد التراكمي المستحق حتى اليوم (Cumulative Earned Budget)
  // مثال: إذا كنا في اليوم 3، والمعدل 100 ج.م -> المستحق حتى اليوم = 300 ج.م
  const accumulatedEarnedToDate = cycle.daysPassedToDate * baseDailyAllowance;

  // الرصيد الفعلي المتاح لليوم (المستحق حتى تاريخ اليوم ناقص ما صُرف قبل اليوم)
  // لو لم يصرف الأحد والإثنين، المستحق 300 وما صُرف قبل اليوم 0 -> المتاح للثلاثاء = 300 ج.م!
  const availableTodayWithRollover = Math.max(0, accumulatedEarnedToDate - spentBeforeToday);

  // مقدار الرصيد المرحّل من الأيام السابقة التي لم يصرف فيها
  const rolloverAmount = Math.max(0, availableTodayWithRollover - baseDailyAllowance);

  // المتبقي لليوم بعد خصم ما تم صرفه اليوم
  const todayRemaining = availableTodayWithRollover - spentToday;

  // 3. المعدل اليومي الذكي للمتبقي من الشهر (لتوزيع باقي الميزانية بالتساوي إن رغب)
  const budgetLeftForRemaining = AppState.budget - spentBeforeToday;
  let smartDailyAllowance = 0;
  if (cycle.remainingDays > 0) {
    smartDailyAllowance = Math.max(0, budgetLeftForRemaining / cycle.remainingDays);
  }

  return {
    cycle,
    totalBudget: AppState.budget,
    totalSpent,
    remainingBudget,
    spentToday,
    spentBeforeToday,
    baseDailyAllowance,
    accumulatedEarnedToDate,
    availableTodayWithRollover,
    rolloverAmount,
    todayRemaining,
    smartDailyAllowance,
    cycleExpenses
  };
}

/**
 * تحديث واجهة المستخدم بالكامل
 */
function renderAll() {
  const calc = getBudgetCalculations();
  renderKPIs(calc);
  renderSmartInsight(calc);
  renderCategoryBreakdown(calc);
  renderTransactionsTable();
  renderCharts(calc);
  updateCurrencyDisplay();
}

/**
 * تحديث البطاقات الإحصائية الرئيسية
 */
function renderKPIs(calc) {
  const curr = AppState.currency;

  // 1. كارت الميزانية الكلية
  document.getElementById('kpiTotalBudget').textContent = formatNumber(calc.totalBudget);
  document.getElementById('kpiBudgetSubtext').textContent = 
    `فترة: ${calc.cycle.totalDays} يوم (${calc.cycle.startDateStr} إلى ${calc.cycle.endDateStr})`;

  // 2. كارت الرصيد المتاح لليوم (مع التراكم والمرحل)
  const kpiDaily = document.getElementById('kpiDailyAllowance');
  kpiDaily.textContent = formatNumber(calc.availableTodayWithRollover);

  const dailyBadge = document.getElementById('kpiDailyBadge');
  const dailySubtext = document.getElementById('kpiDailySubtext');

  if (calc.rolloverAmount > 5) {
    dailyBadge.className = 'kpi-badge badge-success';
    dailyBadge.textContent = `+${formatNumber(calc.rolloverAmount)} مرحّل من أيام سابقة`;
    dailySubtext.textContent = `معدل اليوم (${formatNumber(calc.baseDailyAllowance)}) + رصيد مرحّل (${formatNumber(calc.rolloverAmount)}) ${curr}`;
  } else if (calc.availableTodayWithRollover < calc.baseDailyAllowance && calc.baseDailyAllowance > 0) {
    dailyBadge.className = 'kpi-badge badge-warning';
    dailyBadge.textContent = `لتعويض مصاريف سابقة`;
    dailySubtext.textContent = `المعدل الأساسي: ${formatNumber(calc.baseDailyAllowance)} ${curr} / يوم`;
  } else {
    dailyBadge.className = 'kpi-badge badge-primary';
    dailyBadge.textContent = `معدل يومي قياسي`;
    dailySubtext.textContent = `متبقي ${calc.cycle.remainingDays} يوم في دورتك الحالية`;
  }

  // 3. كارت مصروف اليوم الفعلي والمتبقي لليوم
  document.getElementById('kpiTodaySpent').textContent = formatNumber(calc.spentToday);
  const todayStatusElem = document.getElementById('kpiTodayStatus');
  const todayProgressFill = document.getElementById('todayProgressFill');

  if (calc.availableTodayWithRollover > 0) {
    const todayPct = Math.min(100, Math.round((calc.spentToday / calc.availableTodayWithRollover) * 100));
    todayProgressFill.style.width = `${todayPct}%`;

    if (calc.todayRemaining >= 0) {
      todayStatusElem.textContent = `متبقي لك اليوم: ${formatNumber(calc.todayRemaining)} ${curr}`;
      todayStatusElem.style.color = 'var(--success-text)';
      todayProgressFill.className = 'progress-bar-fill progress-success';
    } else {
      todayStatusElem.textContent = `تجاوزت ميزانية اليوم بـ: ${formatNumber(Math.abs(calc.todayRemaining))} ${curr}`;
      todayStatusElem.style.color = 'var(--danger-text)';
      todayProgressFill.className = 'progress-bar-fill progress-danger';
    }
  } else {
    todayStatusElem.textContent = `المصروف المسجل اليوم`;
    todayProgressFill.style.width = '0%';
  }

  // 4. كارت الرصيد الكلي المتبقي
  const kpiRemaining = document.getElementById('kpiRemainingBudget');
  kpiRemaining.textContent = formatNumber(calc.remainingBudget);

  const remainingBadge = document.getElementById('kpiRemainingBadge');
  const spentPct = calc.totalBudget > 0 ? Math.round((calc.totalSpent / calc.totalBudget) * 100) : 0;
  
  if (calc.remainingBudget < 0) {
    remainingBadge.className = 'kpi-badge badge-danger';
    remainingBadge.textContent = `عجز في الميزانية!`;
  } else if (spentPct > 85) {
    remainingBadge.className = 'kpi-badge badge-warning';
    remainingBadge.textContent = `صرفت ${spentPct}% من الميزانية`;
  } else {
    remainingBadge.className = 'kpi-badge badge-success';
    remainingBadge.textContent = `صرفت ${spentPct}%، الحالة ممتازة`;
  }

  document.getElementById('kpiRemainingSubtext').textContent = 
    `إجمالي ما صُرف: ${formatNumber(calc.totalSpent)} ${curr}`;
}

/**
 * صندوق التوجيه والنصيحة الذكية
 */
function renderSmartInsight(calc) {
  const icon = document.getElementById('insightIcon');
  const title = document.getElementById('insightTitle');
  const desc = document.getElementById('insightDesc');

  if (calc.totalBudget <= 0) {
    icon.textContent = '💡';
    title.textContent = 'ابدأ بتحديد مصروفك الشخصي';
    desc.textContent = 'اضغط على زر "إعداد الميزانية" في الأعلى لكتابة مصروفك الصافي ليقوم البرنامج بحساب معدلك اليومي فوراً.';
    return;
  }

  if (calc.remainingBudget <= 0) {
    icon.textContent = '⚠️';
    title.textContent = 'تنبيه هام: استنفدت كامل ميزانيتك المخصصة!';
    desc.textContent = `لقد تجاوزت ميزانيتك بمقدار ${formatNumber(Math.abs(calc.remainingBudget))} ${AppState.currency}. حاول التوقف عن المصاريف غير الضرورية حتى بداية الشهر القادم.`;
    return;
  }

  // حالة وجود رصيد مرحل من أيام سابقة لم يصرف فيها
  if (calc.rolloverAmount > 10) {
    icon.textContent = '💰';
    title.textContent = `رصيدك التراكمي في ازدياد: مرحّل لك ${formatNumber(calc.rolloverAmount)} ${AppState.currency}`;
    desc.textContent = `لأنك لم تصرف في الأيام السابقة أو وفرت منها، تجمع لك هذا المبلغ! متاح لك صرف حتى ${formatNumber(calc.availableTodayWithRollover)} ${AppState.currency} اليوم بأمان تام ودون إخلال بميزانيتك.`;
    return;
  }

  if (calc.spentToday > calc.availableTodayWithRollover && calc.availableTodayWithRollover > 0) {
    icon.textContent = '⚡';
    title.textContent = 'صرفت اليوم أكثر من المتاح التراكمي';
    desc.textContent = `تجاوزت حد اليوم بـ ${formatNumber(calc.spentToday - calc.availableTodayWithRollover)} ${AppState.currency}. سيقوم التطبيق بتوزيع الفرق على باقي أيام الشهر لتعود ميزانيتك للمسار الصحيح.`;
    return;
  }

  if (calc.spentToday === 0) {
    icon.textContent = '🌟';
    title.textContent = `ميزانيتك المتاحة لليوم: ${formatNumber(calc.availableTodayWithRollover)} ${AppState.currency}`;
    desc.textContent = `إذا لم تصرف هذا المبلغ اليوم، سيتم ترحيله وإضافته تلقائياً لرصيدك في الأيام القادمة لتصرفه متى شئت.`;
    return;
  }

  icon.textContent = '✅';
  title.textContent = 'أداء ممتاز، مصاريفك تحت السيطرة!';
  desc.textContent = `صرفت اليوم ${formatNumber(calc.spentToday)} ${AppState.currency} ومتبقي لك ${formatNumber(calc.todayRemaining)} ${AppState.currency}. استمر على هذا المنوال!`;
}

/**
 * حساب تفصيلي لتوزيع المصاريف حسب البنود (Category Breakdown)
 */
function renderCategoryBreakdown(calc) {
  const breakdownContainer = document.getElementById('categoryBreakdownList');
  if (!breakdownContainer) return;

  const categoryTotals = {};
  
  // تهيئة التصنيفات
  AppState.categories.forEach(cat => {
    categoryTotals[cat.id] = {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      total: 0
    };
  });

  // تجميع المصاريف
  calc.cycleExpenses.forEach(exp => {
    if (categoryTotals[exp.categoryId]) {
      categoryTotals[exp.categoryId].total += Number(exp.amount);
    } else {
      if (!categoryTotals['other']) {
        categoryTotals['other'] = { id: 'other', name: 'أخرى', icon: '💡', color: '#64748b', total: 0 };
      }
      categoryTotals['other'].total += Number(exp.amount);
    }
  });

  // ترتيب التصنيفات تنازلياً من الأكثر استهلاكاً إلى الأقل
  const sortedCategories = Object.values(categoryTotals)
    .filter(cat => cat.total > 0)
    .sort((a, b) => b.total - a.total);

  if (sortedCategories.length === 0) {
    breakdownContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 20px 0; font-size: 13px;">
        لا توجد مصاريف مسجلة في هذه الدورة حتى الآن.
      </div>
    `;
    return;
  }

  const grandTotal = calc.totalSpent > 0 ? calc.totalSpent : 1;

  let html = '';
  sortedCategories.forEach((cat, index) => {
    const pct = ((cat.total / grandTotal) * 100).toFixed(1);
    const isTop = index === 0;

    html += `
      <div class="breakdown-item">
        <div class="breakdown-info">
          <span class="breakdown-name">
            <span class="breakdown-color-dot" style="background-color: ${cat.color};"></span>
            <span>${cat.icon} ${cat.name}</span>
            ${isTop ? '<span class="kpi-badge badge-danger" style="font-size:10px; padding:1px 6px;">الأعلى صرفاً</span>' : ''}
          </span>
          <span class="breakdown-amount">
            ${formatNumber(cat.total)} ${AppState.currency}
            <span class="breakdown-pct">(${pct}%)</span>
          </span>
        </div>
        <div class="progress-bar-bg" style="height: 5px;">
          <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${cat.color};"></div>
        </div>
      </div>
    `;
  });

  breakdownContainer.innerHTML = html;
}

/**
 * تحديث الرسوم البيانية
 */
function renderCharts(calc) {
  // 1. الدونات شارت للتصنيفات
  const categoryTotals = {};
  calc.cycleExpenses.forEach(exp => {
    const cat = AppState.categories.find(c => c.id === exp.categoryId) || { name: 'أخرى', color: '#64748b' };
    if (!categoryTotals[cat.name]) {
      categoryTotals[cat.name] = { total: 0, color: cat.color };
    }
    categoryTotals[cat.name].total += Number(exp.amount);
  });

  if (typeof updateCategoryChart === 'function') {
    updateCategoryChart(categoryTotals, AppState.currency);
  }

  // 2. شارت الإنفاق اليومي لآخر 7 أيام
  if (typeof updateDailySpendingChart === 'function') {
    const daysLabels = [];
    const spentPerDay = [];
    
    // إعداد تواريخ آخر 7 أيام حتى اليوم
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric' });
      daysLabels.push(dayName);

      const dayTotal = AppState.expenses
        .filter(exp => exp.date === dateStr)
        .reduce((sum, exp) => sum + Number(exp.amount), 0);
      
      spentPerDay.push(dayTotal);
    }

    updateDailySpendingChart(daysLabels, spentPerDay, Math.round(calc.baseDailyAllowance), AppState.currency);
  }
}

/**
 * عرض جدول المعاملات الأخير مع إمكانية البحث والفلترة والتعديل والحذف
 */
function renderTransactionsTable() {
  const tbody = document.getElementById('transactionsTableBody');
  const emptyState = document.getElementById('transactionsEmptyState');
  if (!tbody) return;

  const searchTerm = (document.getElementById('txSearchInput')?.value || '').trim().toLowerCase();
  const filterCat = document.getElementById('txFilterCategory')?.value || 'all';

  // تصفية المعاملات بترتيب تنازلي (الأحدث أولاً)
  let filtered = [...AppState.expenses].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  if (filterCat !== 'all') {
    filtered = filtered.filter(exp => exp.categoryId === filterCat);
  }

  if (searchTerm) {
    filtered = filtered.filter(exp => {
      const cat = AppState.categories.find(c => c.id === exp.categoryId);
      const catName = cat ? cat.name.toLowerCase() : '';
      const note = (exp.note || '').toLowerCase();
      const amount = String(exp.amount);
      return catName.includes(searchTerm) || note.includes(searchTerm) || amount.includes(searchTerm);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  let html = '';
  filtered.forEach(exp => {
    const cat = AppState.categories.find(c => c.id === exp.categoryId) || { name: 'أخرى', icon: '💡' };
    const dateFormatted = formatDisplayDate(exp.date);

    html += `
      <tr>
        <td>
          <span class="tx-category-badge">
            <span>${cat.icon}</span>
            <span>${cat.name}</span>
          </span>
        </td>
        <td class="tx-amount">-${formatNumber(exp.amount)} ${AppState.currency}</td>
        <td>${escapeHtml(exp.note || '—')}</td>
        <td style="color: var(--text-secondary); white-space: nowrap;">${dateFormatted}</td>
        <td>
          <div class="tx-actions">
            <button class="btn-action-edit" title="تعديل هذا المصروف" onclick="openEditModal('${exp.id}')">
              ✏️
            </button>
            <button class="btn-action-delete" title="حذف هذا المصروف" onclick="deleteExpense('${exp.id}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * إضافة مصروف جديد (يدعم اليوم وأي تاريخ سابق بأثر رجعي)
 */
function handleAddExpense(e) {
  e.preventDefault();

  const amountInput = document.getElementById('expenseAmount');
  const noteInput = document.getElementById('expenseNote');
  const dateInput = document.getElementById('expenseDate');
  const selectedCatRadio = document.querySelector('input[name="expenseCategory"]:checked');

  const amount = parseFloat(amountInput.value);
  if (!amount || isNaN(amount) || amount <= 0) {
    showToast('يرجى إدخال مبلغ صحيح أكبر من صفر', 'warning');
    amountInput.focus();
    return;
  }

  const categoryId = selectedCatRadio ? selectedCatRadio.value : 'food';
  const note = noteInput.value.trim();
  const date = dateInput.value || getTodayDateString();

  const newExpense = {
    id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    amount: amount,
    categoryId: categoryId,
    note: note,
    date: date,
    timestamp: Date.now()
  };

  AppState.expenses.unshift(newExpense);
  saveData();

  // تفريغ النموذج وإعادة ضبط التاريخ لليوم
  amountInput.value = '';
  noteInput.value = '';
  setExpenseDateOffset(0);

  renderAll();

  const isPast = date < getTodayDateString();
  if (isPast) {
    showToast(`تم تسجيل مصروف ${formatNumber(amount)} ${AppState.currency} ليوم (${formatDisplayDate(date)}) وتحديث الحسابات بأثر رجعي!`, 'success');
  } else {
    showToast(`تم تسجيل مصروف ${formatNumber(amount)} ${AppState.currency} بنجاح`, 'success');
  }
}

/**
 * نافذة تعديل المصروف (Edit Expense Modal)
 */
window.openEditModal = function(id) {
  const exp = AppState.expenses.find(e => e.id === id);
  if (!exp) return;

  document.getElementById('editExpenseId').value = exp.id;
  document.getElementById('editExpenseAmount').value = exp.amount;
  document.getElementById('editExpenseCategory').value = exp.categoryId || 'food';
  document.getElementById('editExpenseNote').value = exp.note || '';
  document.getElementById('editExpenseDate').value = exp.date || getTodayDateString();

  document.getElementById('editExpenseModal').classList.add('active');
};

window.closeEditModal = function() {
  document.getElementById('editExpenseModal').classList.remove('active');
};

function handleSaveEditExpense(e) {
  e.preventDefault();

  const id = document.getElementById('editExpenseId').value;
  const amount = parseFloat(document.getElementById('editExpenseAmount').value);
  const categoryId = document.getElementById('editExpenseCategory').value;
  const note = document.getElementById('editExpenseNote').value.trim();
  const date = document.getElementById('editExpenseDate').value;

  if (isNaN(amount) || amount <= 0) {
    showToast('يرجى إدخال مبلغ صحيح', 'warning');
    return;
  }

  const expIndex = AppState.expenses.findIndex(e => e.id === id);
  if (expIndex !== -1) {
    AppState.expenses[expIndex].amount = amount;
    AppState.expenses[expIndex].categoryId = categoryId;
    AppState.expenses[expIndex].note = note;
    AppState.expenses[expIndex].date = date;

    saveData();
    closeEditModal();
    renderAll();
    showToast('تم تعديل المصروف وإعادة احتساب الميزانية بنجاح!', 'success');
  }
}

/**
 * حذف مصروف محدد
 */
window.deleteExpense = function(id) {
  if (confirm('هل أنت متأكد من حذف هذا المصروف؟')) {
    AppState.expenses = AppState.expenses.filter(exp => exp.id !== id);
    saveData();
    renderAll();
    showToast('تم حذف المصروف بنجاح', 'info');
  }
};

/**
 * فتح وإغلاق نافذة إعداد الميزانية
 */
window.openBudgetModal = function(isFirstTime = false) {
  const modal = document.getElementById('budgetModal');
  const budgetInput = document.getElementById('modalBudgetAmount');
  const currencySelect = document.getElementById('modalCurrency');
  const cycleSelect = document.getElementById('modalCycleType');
  const salaryDayInput = document.getElementById('modalSalaryDay');

  budgetInput.value = AppState.budget || '';
  currencySelect.value = AppState.currency || 'ج.م';
  cycleSelect.value = AppState.cycleType || 'monthly';
  salaryDayInput.value = AppState.salaryDay || 1;

  toggleSalaryDayVisibility();

  modal.classList.add('active');
  if (isFirstTime) {
    budgetInput.focus();
  }
};

window.closeBudgetModal = function() {
  document.getElementById('budgetModal').classList.remove('active');
};

/**
 * حفظ إعدادات الميزانية من المودال
 */
function handleSaveBudget(e) {
  e.preventDefault();

  const budgetInput = document.getElementById('modalBudgetAmount');
  const currencySelect = document.getElementById('modalCurrency');
  const cycleSelect = document.getElementById('modalCycleType');
  const salaryDayInput = document.getElementById('modalSalaryDay');

  const budget = parseFloat(budgetInput.value);
  if (isNaN(budget) || budget <= 0) {
    showToast('يرجى إدخال مبلغ ميزانية صحيح', 'warning');
    budgetInput.focus();
    return;
  }

  AppState.budget = budget;
  AppState.currency = currencySelect.value;
  AppState.cycleType = cycleSelect.value;
  AppState.salaryDay = parseInt(salaryDayInput.value, 10) || 1;

  saveData();
  closeBudgetModal();
  renderAll();
  showToast('تم حفظ إعدادات الميزانية بنجاح!', 'success');
}

function toggleSalaryDayVisibility() {
  const cycleType = document.getElementById('modalCycleType').value;
  const salaryGroup = document.getElementById('salaryDayGroup');
  if (cycleType === 'salary_day') {
    salaryGroup.style.display = 'block';
  } else {
    salaryGroup.style.display = 'none';
  }
}

/**
 * تحديث نصوص العملة المعروضة في مختلف أجزاء التطبيق
 */
function updateCurrencyDisplay() {
  document.querySelectorAll('.currency-tag').forEach(el => {
    el.textContent = AppState.currency;
  });
}

/**
 * تبديل الثيم الليلي / الفاتح
 */
function initTheme() {
  const savedTheme = AppState.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  AppState.theme = theme;
  saveData();
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  const calc = getBudgetCalculations();
  renderCharts(calc);
}

/**
 * تصدير البيانات كملف Excel (CSV) بترميز UTF-8 مع BOM لدعم اللغة العربية
 */
window.exportToCSV = function() {
  if (AppState.expenses.length === 0) {
    showToast('لا توجد مصاريف لتصديرها', 'warning');
    return;
  }

  let csvContent = '\uFEFF';
  csvContent += 'التاريخ,التصنيف,المبلغ,العملة,الملاحظات\n';

  AppState.expenses.forEach(exp => {
    const cat = AppState.categories.find(c => c.id === exp.categoryId) || { name: 'أخرى' };
    const note = `"${(exp.note || '').replace(/"/g, '""')}"`;
    csvContent += `${exp.date},${cat.name},${exp.amount},${AppState.currency},${note}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `مصاريفي_${getTodayDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('تم تصدير ملف الإكسيل بنجاح', 'success');
};

/**
 * تصدير واستيراد نسخة احتياطية (JSON Backup)
 */
window.exportBackupJSON = function() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(AppState, null, 2));
  const link = document.createElement('a');
  link.setAttribute('href', dataStr);
  link.setAttribute('download', `محفظتي_نسخة_احتياطية_${getTodayDateString()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('تم تصدير ملف النسخة الاحتياطية بنجاح', 'success');
};

window.importBackupJSON = function() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported.budget !== 'undefined' && Array.isArray(imported.expenses)) {
          AppState.budget = imported.budget;
          AppState.currency = imported.currency || 'ج.م';
          AppState.cycleType = imported.cycleType || 'monthly';
          AppState.salaryDay = imported.salaryDay || 1;
          AppState.expenses = imported.expenses;
          if (Array.isArray(imported.categories)) {
            AppState.categories = imported.categories;
          }
          saveData();
          renderAll();
          showToast('تم استعادة البيانات بنجاح!', 'success');
        } else {
          showToast('الملف غير صالح أو لا يحتوي على بنية بيانات صحيحة', 'danger');
        }
      } catch (err) {
        showToast('فشل قراءة ملف النسخة الاحتياطية', 'danger');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

/**
 * توليد وتحديث خيارات التصنيفات في كافة أرجاء التطبيق
 */
function renderCategorySelector() {
  const container = document.getElementById('categorySelectorGrid');
  const filterSelect = document.getElementById('txFilterCategory');
  const editSelect = document.getElementById('editExpenseCategory');

  // تحديث شبكة اختيار التصنيف في نموذج المصروف
  if (container) {
    let html = '';
    AppState.categories.forEach((cat, index) => {
      html += `
        <div>
          <input type="radio" name="expenseCategory" id="cat_${cat.id}" value="${cat.id}" class="cat-radio" ${index === 0 ? 'checked' : ''}>
          <label for="cat_${cat.id}" class="cat-label">
            <span class="cat-icon">${cat.icon}</span>
            <span>${cat.name}</span>
          </label>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // تحديث قائمة فلترة المعاملات
  if (filterSelect) {
    const currentVal = filterSelect.value;
    let optHtml = '<option value="all">كل التصنيفات</option>';
    AppState.categories.forEach(cat => {
      optHtml += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
    });
    filterSelect.innerHTML = optHtml;
    if (currentVal && filterSelect.querySelector(`option[value="${currentVal}"]`)) {
      filterSelect.value = currentVal;
    }
  }

  // تحديث قائمة التصنيفات في نافذة تعديل المصروف
  if (editSelect) {
    let optHtml = '';
    AppState.categories.forEach(cat => {
      optHtml += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
    });
    editSelect.innerHTML = optHtml;
  }
}

/**
 * نافذة إدارة التصنيفات المخصصة
 */
window.openCategoriesModal = function() {
  renderModalCategoriesList();
  document.getElementById('categoriesModal').classList.add('active');
  document.getElementById('newCategoryName').focus();
};

window.closeCategoriesModal = function() {
  document.getElementById('categoriesModal').classList.remove('active');
};

window.selectNewCategoryIcon = function(icon) {
  const input = document.getElementById('newCategoryIcon');
  if (input) input.value = icon;
};

function renderModalCategoriesList() {
  const listContainer = document.getElementById('modalCategoriesList');
  const countSpan = document.getElementById('categoriesCount');
  if (!listContainer) return;

  countSpan.textContent = AppState.categories.length;

  let html = '';
  AppState.categories.forEach(cat => {
    const linkedCount = AppState.expenses.filter(e => e.categoryId === cat.id).length;

    html += `
      <div class="category-list-item">
        <div class="category-list-info">
          <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${cat.color};"></span>
          <span style="font-size: 18px;">${cat.icon}</span>
          <span>${escapeHtml(cat.name)}</span>
          ${linkedCount > 0 ? `<span style="font-size: 11px; color: var(--text-muted);">(${linkedCount} مصروف)</span>` : ''}
        </div>
        <div>
          <button type="button" class="btn-action-delete" title="حذف هذا التصنيف" onclick="deleteCategory('${cat.id}')">
            🗑️
          </button>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;
}

function handleAddNewCategory(e) {
  e.preventDefault();

  const nameInput = document.getElementById('newCategoryName');
  const iconInput = document.getElementById('newCategoryIcon');
  const colorInput = document.getElementById('newCategoryColor');

  const name = nameInput.value.trim();
  const icon = iconInput.value.trim() || '💡';
  const color = colorInput.value || '#64748b';

  if (!name) {
    showToast('يرجى كتابة اسم التصنيف', 'warning');
    nameInput.focus();
    return;
  }

  // التحقق من عدم التكرار
  const exists = AppState.categories.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showToast(`التصنيف "${name}" موجود بالفعل!`, 'warning');
    nameInput.focus();
    return;
  }

  const newCat = {
    id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name,
    icon: icon,
    color: color
  };

  AppState.categories.push(newCat);
  saveData();

  nameInput.value = '';
  renderCategorySelector();
  renderModalCategoriesList();
  renderAll();

  showToast(`تم إضافة تصنيف (${icon} ${name}) بنجاح!`, 'success');
}

window.deleteCategory = function(id) {
  if (AppState.categories.length <= 1) {
    showToast('يجب الاحتفاظ بتصنيف واحد على الأقل في التطبيق', 'warning');
    return;
  }

  const cat = AppState.categories.find(c => c.id === id);
  if (!cat) return;

  const linkedExpenses = AppState.expenses.filter(e => e.categoryId === id);
  let confirmMsg = `هل أنت متأكد من حذف تصنيف "${cat.name}"؟`;
  if (linkedExpenses.length > 0) {
    confirmMsg += `\n(يوجد ${linkedExpenses.length} مصاريف مسجلة بهذا التصنيف، وسيتم تحويلها تلقائياً لتصنيف "أخرى")`;
  }

  if (confirm(confirmMsg)) {
    let fallbackCat = AppState.categories.find(c => c.id !== id && c.id === 'other') || AppState.categories.find(c => c.id !== id);
    const fallbackId = fallbackCat ? fallbackCat.id : 'other';

    AppState.expenses.forEach(e => {
      if (e.categoryId === id) {
        e.categoryId = fallbackId;
      }
    });

    AppState.categories = AppState.categories.filter(c => c.id !== id);
    saveData();

    renderCategorySelector();
    renderModalCategoriesList();
    renderAll();

    showToast(`تم حذف تصنيف "${cat.name}" بنجاح`, 'info');
  }
};

/**
 * ربط كافة الأحداث (Event Listeners)
 */
function setupEventListeners() {
  // نموذج إضافة مصروف
  document.getElementById('expenseForm')?.addEventListener('submit', handleAddExpense);

  // نموذج إضافة تصنيف جديد
  document.getElementById('newCategoryForm')?.addEventListener('submit', handleAddNewCategory);

  // نموذج تعديل مصروف
  document.getElementById('editExpenseForm')?.addEventListener('submit', handleSaveEditExpense);

  // نموذج الميزانية في المودال
  document.getElementById('budgetForm')?.addEventListener('submit', handleSaveBudget);

  // تغيير نوع دورة الميزانية
  document.getElementById('modalCycleType')?.addEventListener('change', toggleSalaryDayVisibility);

  // تغيير التاريخ يدوياً يزيل التفعيل من أزرار الأيام السريعة إذا كان تاريخاً غير مطابق
  document.getElementById('expenseDate')?.addEventListener('change', (e) => {
    const selectedDate = e.target.value;
    let matched = false;
    document.querySelectorAll('.btn-quick-date').forEach(btn => {
      const daysAgo = parseInt(btn.getAttribute('data-days-ago'), 10);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (`${y}-${m}-${day}` === selectedDate) {
        btn.classList.add('active');
        matched = true;
      } else {
        btn.classList.remove('active');
      }
    });
    if (!matched) {
      document.querySelectorAll('.btn-quick-date').forEach(btn => btn.classList.remove('active'));
    }
  });

  // أزرار المبالغ السريعة
  document.querySelectorAll('.btn-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      const amt = btn.getAttribute('data-amount');
      const input = document.getElementById('expenseAmount');
      if (input) {
        input.value = amt;
        input.focus();
      }
    });
  });

  // البحث والفلترة
  document.getElementById('txSearchInput')?.addEventListener('input', renderTransactionsTable);
  document.getElementById('txFilterCategory')?.addEventListener('change', renderTransactionsTable);

  // زر تغيير الثيم
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  // إغلاق المودال عند النقر خارج المحتوى
  document.getElementById('budgetModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'budgetModal') {
      closeBudgetModal();
    }
  });

  document.getElementById('editExpenseModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'editExpenseModal') {
      closeEditModal();
    }
  });

  document.getElementById('categoriesModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'categoriesModal') {
      closeCategoriesModal();
    }
  });
}

/**
 * تنبيهات سريعة (Toast Notification)
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'danger') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * دوال مساعدة للتنسيق والترميز
 */
function formatNumber(num) {
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('ar-EG');
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const today = getTodayDateString();
  if (dateStr === today) return 'اليوم';

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yStr = yesterdayDate.toISOString().split('T')[0];
  if (dateStr === yStr) return 'أمس';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
