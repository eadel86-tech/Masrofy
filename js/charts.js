/**
 * وحدة الرسوم البيانية التفاعلية (Chart.js Integration)
 * تدعم الاتجاه العربي RTL والثيم الليلي والفاتح والتحديث التلقائي
 */

let categoryChartInstance = null;
let dailyChartInstance = null;

// ألوان مخصصة للتصنيفات لتبدو واضحة وجذابة
const CATEGORY_COLORS = {
  'food': '#f97316',       // برتقالي
  'coffee': '#8b5cf6',     // بنفسجي
  'transport': '#0ea5e9',  // سماوي
  'groceries': '#10b981',  // أخضر
  'entertainment': '#ec4899', // وردي
  'shopping': '#f59e0b',   // ذهبي / عنبر
  'health': '#ef4444',     // أحمر
  'bills': '#6366f1',      // أزرق نيلي
  'other': '#64748b'       // رمادي مزرق
};

const PALETTE = [
  '#f97316', '#8b5cf6', '#0ea5e9', '#10b981', '#ec4899', 
  '#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#a855f7', '#64748b'
];

/**
 * جلب ألوان الثيم الحالي للتكامل مع الرسم البياني
 */
function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    isDark,
    textColor: isDark ? '#cbd5e1' : '#475569',
    gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    cardBg: isDark ? '#141c2e' : '#ffffff',
    borderColor: isDark ? '#1e293b' : '#e2e8f0'
  };
}

/**
 * تهيئة أو تحديث الرسم البياني الدائري لتوزيع المصاريف (Donut Chart)
 */
function updateCategoryChart(categoryData, currency = 'ج.م') {
  const canvas = document.getElementById('categoryDonutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const theme = getThemeColors();

  const labels = Object.keys(categoryData);
  const values = Object.values(categoryData).map(c => c.total);
  const colors = Object.values(categoryData).map((c, i) => c.color || PALETTE[i % PALETTE.length]);

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  // إذا لم تكن هناك مصاريف مسجلة بعد
  if (values.length === 0 || values.reduce((a, b) => a + b, 0) === 0) {
    categoryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['لا توجد مصاريف حتى الآن'],
        datasets: [{
          data: [1],
          backgroundColor: [theme.isDark ? '#1e293b' : '#f1f5f9'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        cutout: '72%'
      }
    });
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: theme.cardBg,
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // يتم عرض الداتا في قائمة أنيقة بجانب الرسم
        },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          backgroundColor: theme.isDark ? '#0f172a' : '#1e293b',
          titleFont: { family: 'Segoe UI, Tahoma', size: 13 },
          bodyFont: { family: 'Segoe UI, Tahoma', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = Number(context.parsed).toLocaleString('ar-EG');
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
              return ` ${label}: ${value} ${currency} (${percentage}%)`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

/**
 * تهيئة أو تحديث الرسم البياني للإنفاق اليومي (Daily Trend Chart)
 * يوضح الصرف الفعلي لكل يوم مقارنة بالحد اليومي الموصى به
 */
function updateDailySpendingChart(daysLabels, spentPerDay, targetDailyBudget, currency = 'ج.م') {
  const canvas = document.getElementById('dailyTrendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const theme = getThemeColors();

  if (dailyChartInstance) {
    dailyChartInstance.destroy();
  }

  // رسم خط الميزانية المسموح بها كمرجع
  const targetLineData = daysLabels.map(() => targetDailyBudget);

  dailyChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daysLabels,
      datasets: [
        {
          label: 'الصرف الفعلي',
          data: spentPerDay,
          backgroundColor: spentPerDay.map(val => 
            val > targetDailyBudget ? '#ef4444' : '#4f46e5'
          ),
          borderRadius: 6,
          barPercentage: 0.65
        },
        {
          label: 'الحد اليومي المستهدف',
          data: targetLineData,
          type: 'line',
          borderColor: '#10b981',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          rtl: true,
          labels: {
            color: theme.textColor,
            font: { family: 'Segoe UI, Tahoma', size: 12 },
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true
          }
        },
        tooltip: {
          rtl: true,
          textDirection: 'rtl',
          backgroundColor: theme.isDark ? '#0f172a' : '#1e293b',
          callbacks: {
            label: function(context) {
              const val = Number(context.parsed.y).toLocaleString('ar-EG');
              return ` ${context.dataset.label}: ${val} ${currency}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: theme.textColor,
            font: { family: 'Segoe UI, Tahoma', size: 11 }
          }
        },
        y: {
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.textColor,
            font: { family: 'Segoe UI, Tahoma', size: 11 },
            callback: function(value) {
              return value.toLocaleString('ar-EG');
            }
          },
          beginAtZero: true
        }
      }
    }
  });
}
