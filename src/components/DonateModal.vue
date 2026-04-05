<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from '../composables/useI18n'
import { X, Heart, Coffee, Gift, Crown, CheckCircle2 } from 'lucide-vue-next'

const { t } = useI18n()

/** 支付方式类型 */
type PaymentMethod = 'wechat' | 'alipay'

/** 固定金额选项 */
const fixedAmounts = computed(() => [
  { value: 1, label: t('donate.coffee'), icon: Coffee, desc: t('donate.thanks') },
  { value: 5, label: t('donate.meal'), icon: Heart, desc: t('donate.thanksALot') },
  { value: 10, label: t('donate.gift'), icon: Gift, desc: t('donate.awesome') },
  { value: 50, label: t('donate.bigBoss'), icon: Crown, desc: t('donate.thanksBoss') }
])

/** 显示状态 */
const visible = defineModel<boolean>({ default: false })

/** 选中的金额 */
const selectedAmount = ref<number>(5)
/** 自定义金额 */
const customAmount = ref<string>('')
/** 是否使用自定义金额 */
const useCustomAmount = ref(false)
/** 选中的支付方式 */
const selectedPayment = ref<PaymentMethod>('wechat')
/** 是否显示感谢页面 */
const showThanks = ref(false)

/** 实际打赏金额 */
const actualAmount = computed(() => {
  if (useCustomAmount.value && customAmount.value) {
    return Math.max(0.01, parseFloat(customAmount.value) || 0)
  }
  return selectedAmount.value
})

/** 支付方式配置 */
const paymentMethods = computed(() => [
  { 
    id: 'wechat' as PaymentMethod, 
    label: t('donate.wechatPay'), 
    color: 'bg-green-500',
    qrCode: '/donate/wechat-qr.jpg',
    payeeName: '_4(**超)'
  },
  { 
    id: 'alipay' as PaymentMethod, 
    label: t('donate.alipay'), 
    color: 'bg-blue-500',
    qrCode: '/donate/alipay-qr.jpg',
    payeeName: '乔鑫超(**超)'
  }
])

/** 获取当前选中的支付方式配置 */
const currentPaymentMethod = computed(() => {
  return paymentMethods.value.find(m => m.id === selectedPayment.value) || paymentMethods.value[0]
})

/**
 * 选择固定金额
 */
function selectAmount(amount: number): void {
  selectedAmount.value = amount
  useCustomAmount.value = false
}

/**
 * 启用自定义金额
 */
function enableCustomAmount(): void {
  useCustomAmount.value = true
  customAmount.value = ''
}

/**
 * 确认打赏
 */
function confirmDonate(): void {
  // 保存打赏记录到本地存储
  const records = getDonateRecords()
  records.push({
    id: Date.now(),
    amount: actualAmount.value,
    method: selectedPayment.value,
    timestamp: Date.now()
  })
  localStorage.setItem('donate-records', JSON.stringify(records))
  
  // 显示感谢页面
  showThanks.value = true
}

/**
 * 获取打赏记录
 */
function getDonateRecords(): Array<{ id: number; amount: number; method: PaymentMethod; timestamp: number }> {
  try {
    const data = localStorage.getItem('donate-records')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 关闭弹窗
 */
function close(): void {
  visible.value = false
  setTimeout(() => {
    showThanks.value = false
  }, 300)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div 
        v-if="visible" 
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <!-- Header -->
          <div class="relative bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-8 text-white">
            <button 
              @click="close"
              class="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X class="w-5 h-5" />
            </button>
            <div class="text-center">
              <Heart class="w-12 h-12 mx-auto mb-3 animate-pulse" />
              <h2 class="text-xl font-bold">{{ t('donate.title') }}</h2>
              <p class="text-sm text-white/80 mt-1">{{ t('donate.subtitle') }}</p>
            </div>
          </div>

          <!-- Content -->
          <div class="p-6">
            <!-- 感谢页面 -->
            <div v-if="showThanks" class="py-6">
              <div class="text-center mb-6">
                <CheckCircle2 class="w-16 h-16 mx-auto text-green-500 mb-4" />
                <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">{{ t('donate.thankYou') }}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400">
                  {{ t('donate.yourAmount') }}<span class="text-2xl font-bold text-blue-600">¥{{ actualAmount.toFixed(2) }}</span>
                </p>
              </div>

              <!-- 收款二维码 -->
              <div class="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 text-center">
                <p class="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  {{ t('donate.scanToPay', { method: currentPaymentMethod.label }) }}
                </p>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 inline-block">
                  <img
                    :src="currentPaymentMethod.qrCode"
                    :alt="currentPaymentMethod.label"
                    class="w-64 h-64 object-contain"
                  />
                </div>
                <p class="text-xs text-slate-400 dark:text-slate-500 mt-3">
                  {{ t('donate.payee') }}{{ currentPaymentMethod.payeeName }}
                </p>
              </div>

              <button 
                @click="close"
                class="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {{ t('common.confirm') }}
              </button>
            </div>

            <!-- 打赏表单 -->
            <template v-else>
              <!-- 金额选择 -->
              <div class="mb-6">
                <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{{ t('donate.selectAmount') }}</h3>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="item in fixedAmounts"
                    :key="item.value"
                    @click="selectAmount(item.value)"
                    class="p-3 rounded-xl border-2 transition-all text-left"
                    :class="!useCustomAmount && selectedAmount === item.value 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'"
                  >
                    <div class="flex items-center gap-2">
                      <component :is="item.icon" class="w-5 h-5 text-slate-500 dark:text-slate-400" />
                      <span class="font-medium text-slate-800 dark:text-slate-200">¥{{ item.value }}</span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">{{ item.label }}</div>
                  </button>
                </div>

                <!-- 自定义金额 -->
                <div class="mt-3">
                  <div 
                    @click="enableCustomAmount"
                    class="flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer"
                    :class="useCustomAmount 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'"
                  >
                    <span class="text-sm text-slate-600 dark:text-slate-400">{{ t('donate.customAmount') }}</span>
                    <div v-if="useCustomAmount" class="flex-1">
                      <input
                        v-model="customAmount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        :placeholder="t('donate.enterAmount')"
                        class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        @click.stop
                      />
                    </div>
                    <span v-else class="text-sm text-slate-400">{{ t('donate.clickToEnter') }}</span>
                  </div>
                </div>
              </div>

              <!-- 支付方式选择 -->
              <div class="mb-6">
                <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">{{ t('donate.selectPayment') }}</h3>
                <div class="flex gap-3">
                  <button
                    v-for="method in paymentMethods"
                    :key="method.id"
                    @click="selectedPayment = method.id"
                    class="flex-1 py-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2"
                    :class="selectedPayment === method.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'"
                  >
                    <div :class="[method.color, 'w-5 h-5 rounded-full']"></div>
                    <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ method.label }}</span>
                  </button>
                </div>
              </div>

              <!-- 打赏金额显示 -->
              <div class="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 mb-6 text-center">
                <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('donate.donateAmount') }}</span>
                <div class="text-3xl font-bold text-blue-600 mt-1">¥{{ actualAmount.toFixed(2) }}</div>
              </div>

              <!-- 确认按钮 -->
              <button
                @click="confirmDonate"
                class="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-500/25"
              >
                <span class="flex items-center justify-center gap-2">
                  <Heart class="w-5 h-5" />
                  {{ t('donate.confirmDonate') }}
                </span>
              </button>

              <!-- 提示 -->
              <p class="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
                {{ t('donate.scanHint') }}
              </p>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .bg-white,
.modal-leave-active .bg-white,
.modal-enter-active .dark\:bg-slate-800,
.modal-leave-active .dark\:bg-slate-800 {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .bg-white,
.modal-leave-to .bg-white,
.modal-enter-from .dark\:bg-slate-800,
.modal-leave-to .dark\:bg-slate-800 {
  transform: scale(0.95);
}
</style>
