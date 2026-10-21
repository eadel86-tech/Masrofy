/**
 * محفظتي الذكية - وحدة المزامنة السحابية اللحظية (Cloud Sync with Firebase)
 * تتيح مزامنة البيانات تلقائياً وفورياً بين الموبايل والكمبيوتر وأي جهاز آخر
 */

const firebaseConfig = {
  apiKey: "AIzaSyB3LETGTzpDU7gNFXJg6XemwaBS1ewbWlw",
  authDomain: "masrofy-a3369.firebaseapp.com",
  projectId: "masrofy-a3369",
  storageBucket: "masrofy-a3369.firebasestorage.app",
  messagingSenderId: "221963213957",
  appId: "1:221963213957:web:85ebffb2efabadf9545dec",
  measurementId: "G-X3ZRK0VZF2"
};

const SYNC_KEY_STORAGE = 'masrofy_cloud_sync_key';
const DEFAULT_SYNC_KEY = 'eslam-wallet';

let cloudDb = null;
let syncUnsubscribe = null;
let isApplyingRemoteChange = false;
let syncStatus = 'offline'; // 'connected' | 'syncing' | 'offline'

/**
 * تهيئة Firebase وربط المزامنة السحابية
 */
function initFirebaseSync() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded, continuing in local mode.');
    updateSyncIndicator('offline', 'غير متصل بالسحابة');
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    cloudDb = firebase.firestore();

    // تفعيل التخزين المؤقت المحلي للعمل بدون إنترنت
    cloudDb.enablePersistence({ synchronizeTabs: true }).catch(err => {
      console.warn('Firestore persistence note:', err.code);
    });

    // بدء المزامنة بكود المحفظة الحالي
    startSyncListener(getCurrentSyncKey());

    // مراقبة اتصال الإنترنت
    window.addEventListener('online', () => {
      updateSyncIndicator('connected', 'متزامن سحابياً');
      pushLocalDataToCloud();
    });

    window.addEventListener('offline', () => {
      updateSyncIndicator('offline', 'أوفلاين (محفوظ محلياً)');
    });

  } catch (error) {
    console.error('Firebase initialization error:', error);
    updateSyncIndicator('offline', 'خطأ في الاتصال');
  }
}

/**
 * جلب كود المزامنة الحالي
 */
function getCurrentSyncKey() {
  let key = localStorage.getItem(SYNC_KEY_STORAGE);
  if (!key || !key.trim()) {
    key = DEFAULT_SYNC_KEY;
    localStorage.setItem(SYNC_KEY_STORAGE, key);
  }
  return key.trim().toLowerCase();
}

/**
 * بدء الاستماع للتحديثات اللحظية من السحابة
 */
function startSyncListener(syncKey) {
  if (!cloudDb) return;

  if (syncUnsubscribe) {
    syncUnsubscribe();
  }

  updateSyncIndicator('syncing', 'جاري المزامنة...');

  const docRef = cloudDb.collection('wallets').doc(syncKey);

  syncUnsubscribe = docRef.onSnapshot(
    docSnapshot => {
      if (docSnapshot.exists) {
        const remoteData = docSnapshot.data();
        applyRemoteData(remoteData);
        updateSyncIndicator('connected', 'متزامن سحابياً');
      } else {
        // إذا كان الكود جديداً ولا توجد بيانات سحابية له، نرفع البيانات الحالية للسحابة
        pushLocalDataToCloud();
        updateSyncIndicator('connected', 'متزامن سحابياً');
      }
    },
    error => {
      console.warn('Firestore onSnapshot error:', error);
      updateSyncIndicator('offline', 'أوفلاين (محفوظ محلياً)');
    }
  );
}

/**
 * تطبيق البيانات المستلمة من السحابة وتحديث الشاشة فوراً
 */
function applyRemoteData(remote) {
  if (!remote) return;

  isApplyingRemoteChange = true;

  try {
    if (typeof remote.budget !== 'undefined') AppState.budget = Number(remote.budget) || 0;
    if (remote.currency) AppState.currency = remote.currency;
    if (remote.cycleType) AppState.cycleType = remote.cycleType;
    if (remote.salaryDay) AppState.salaryDay = Number(remote.salaryDay) || 1;
    if (remote.customStartDate) AppState.customStartDate = remote.customStartDate;
    if (remote.customDaysCount) AppState.customDaysCount = Number(remote.customDaysCount) || 30;
    if (Array.isArray(remote.expenses)) AppState.expenses = remote.expenses;
    if (Array.isArray(remote.categories) && remote.categories.length > 0) {
      AppState.categories = remote.categories;
    }

    // حفظ في الذاكرة المحلية للجهاز
    saveData();

    // تحديث الواجهة والرسوم البيانية لحظياً
    if (typeof renderCategorySelector === 'function') renderCategorySelector();
    if (typeof renderAll === 'function') renderAll();

  } catch (err) {
    console.error('Error applying remote data:', err);
  } finally {
    isApplyingRemoteChange = false;
  }
}

/**
 * رفع البيانات المحلية إلى السحابة
 */
function pushLocalDataToCloud() {
  if (!cloudDb || isApplyingRemoteChange) return;

  const syncKey = getCurrentSyncKey();
  const docRef = cloudDb.collection('wallets').doc(syncKey);

  const payload = {
    budget: AppState.budget || 0,
    currency: AppState.currency || 'ج.م',
    cycleType: AppState.cycleType || 'monthly',
    salaryDay: AppState.salaryDay || 1,
    customStartDate: AppState.customStartDate || '',
    customDaysCount: AppState.customDaysCount || 30,
    expenses: AppState.expenses || [],
    categories: AppState.categories || [],
    lastUpdated: Date.now()
  };

  updateSyncIndicator('syncing', 'جاري المزامنة...');

  docRef.set(payload, { merge: true })
    .then(() => {
      updateSyncIndicator('connected', 'متزامن سحابياً');
    })
    .catch(err => {
      console.warn('Error pushing data to cloud:', err);
      updateSyncIndicator('offline', 'أوفلاين (محفوظ محلياً)');
    });
}

/**
 * تحديث مؤشر المزامنة في رأس الصفحة
 */
function updateSyncIndicator(status, text) {
  syncStatus = status;
  const dot = document.getElementById('syncStatusDot');
  const txt = document.getElementById('syncStatusText');
  const keyDisplay = document.getElementById('currentSyncKeyDisplay');

  if (dot) {
    if (status === 'connected') {
      dot.style.backgroundColor = '#10b981'; // أخضر
    } else if (status === 'syncing') {
      dot.style.backgroundColor = '#f59e0b'; // برتقالي
    } else {
      dot.style.backgroundColor = '#94a3b8'; // رمادي أوفلاين
    }
  }

  if (txt) {
    txt.textContent = text;
  }

  if (keyDisplay) {
    keyDisplay.textContent = getCurrentSyncKey();
  }
}

/**
 * نافذة إدارة كود المزامنة (Sync Modal)
 */
window.openSyncModal = function() {
  const modal = document.getElementById('syncModal');
  const input = document.getElementById('syncKeyInput');
  if (input) {
    input.value = getCurrentSyncKey();
  }
  updateSyncIndicator(syncStatus, syncStatus === 'connected' ? 'متزامن سحابياً' : 'أوفلاين');
  if (modal) modal.classList.add('active');
};

window.closeSyncModal = function() {
  const modal = document.getElementById('syncModal');
  if (modal) modal.classList.remove('active');
};

window.saveNewSyncKey = function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('syncKeyInput');
  const newKey = (input?.value || '').trim().toLowerCase();

  if (!newKey) {
    showToast('يرجى إدخال كود مزامنة صحيح', 'warning');
    return;
  }

  localStorage.setItem(SYNC_KEY_STORAGE, newKey);
  closeSyncModal();
  startSyncListener(newKey);
  showToast(`تم ربط المحفظة بالكود (${newKey}) بنجاح!`, 'success');
};

window.generateNewSyncKey = function() {
  const randomCode = 'wallet-' + Math.floor(1000 + Math.random() * 9000);
  const input = document.getElementById('syncKeyInput');
  if (input) {
    input.value = randomCode;
  }
};
