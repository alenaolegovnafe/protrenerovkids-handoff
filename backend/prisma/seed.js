const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { normalizePhone } = require('../src/lib/duplicateCheck');
const { signAdminToken, signCoachToken } = require('../src/lib/tokens');
const { recomputeEntitlement } = require('../src/lib/entitlement');

const prisma = new PrismaClient();

async function main() {
  console.log('Очищаю таблицы (только для dev-базы!)...');
  // Порядок важен из-за внешних ключей — сначала дочерние записи
  await prisma.reviewComplaint.deleteMany();
  await prisma.review.deleteMany();
  await prisma.callComment.deleteMany();
  await prisma.callRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.diarySlot.deleteMany();
  await prisma.coachArena.deleteMany();
  await prisma.contactClick.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.telegramUpdate.deleteMany();
  await prisma.boostWaitlistEntry.deleteMany();
  await prisma.coachBoost.deleteMany();
  await prisma.coach.deleteMany();
  await prisma.sportRequest.deleteMany();
  await prisma.coachReferral.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.arena.deleteMany();
  await prisma.sportSchool.deleteMany();
  await prisma.managerSession.deleteMany();
  await prisma.managerPlan.deleteMany();
  await prisma.payCoefficientTier.deleteMany();
  await prisma.adminUser.deleteMany();

  // ---------- Админка ----------
  console.log('Создаю пользователей админки...');

  const SUPER_ADMIN_DEV_PASSWORD = 'dev-password-change-me';
  const superAdmin = await prisma.adminUser.create({
    data: {
      name: 'Алёна (владелец)',
      phone: '+7 900 000-00-01',
      phoneNormalized: normalizePhone('+7 900 000-00-01'),
      role: 'SUPER_ADMIN',
      email: 'alena@protrenerovkids.ru',
      passwordHash: await bcrypt.hash(SUPER_ADMIN_DEV_PASSWORD, 10),
    },
  });
  const managerAnya = await prisma.adminUser.create({
    data: { name: 'Менеджер Аня', phone: '+7 900 000-00-02', phoneNormalized: normalizePhone('+7 900 000-00-02'), role: 'MANAGER' },
  });
  const managerIra = await prisma.adminUser.create({
    data: { name: 'Менеджер Ира', phone: '+7 900 000-00-03', phoneNormalized: normalizePhone('+7 900 000-00-03'), role: 'MANAGER' },
  });

  // Стартовые пороги коэффициента к оплате — это решение про деньги, не
  // про код, Алёна меняет их сама через PUT /api/admin/pay-tiers, разработчик
  // не нужен. Здесь только для примера, чтобы демо не было пустым.
  await prisma.payCoefficientTier.createMany({
    data: [
      { minPercent: 0, coefficient: 0.8, label: 'Ниже базы' },
      { minPercent: 50, coefficient: 1.0, label: 'База' },
      { minPercent: 100, coefficient: 1.2, label: 'Хорошо' },
      { minPercent: 150, coefficient: 1.5, label: 'Отлично' },
    ],
  });

  // Персональный план на день/неделю/месяц для каждого менеджера — тоже
  // задаётся супер-админом (PUT /api/admin/managers/:id/plan).
  await prisma.managerPlan.create({
    data: { managerId: managerAnya.id, dailyTarget: 1, weeklyTarget: 5, monthlyTarget: 15 },
  });
  await prisma.managerPlan.create({
    data: { managerId: managerIra.id, dailyTarget: 1, weeklyTarget: 4, monthlyTarget: 12 },
  });

  // ---------- Арены ----------
  console.log('Создаю арены...');

  const arenaLuna = await prisma.arena.create({
    data: {
      name: 'Каток «Луна» (Айсберг)',
      address: 'Сибирский тракт, 34Б',
      phone: '+7 (343) 300-83-33',
      website: 'luna66.ru',
      scheduleSource: 'LIVE_SITE',
    },
  });
  const arenaFakel = await prisma.arena.create({
    data: {
      name: 'ФОК «Факел»',
      address: 'ул. Пехотинцев, 31',
      scheduleSource: 'VK_GROUP',
    },
  });
  await prisma.arena.create({
    data: { name: 'ЛА «Спартаковец»', address: 'ул. Энгельса, 31А', scheduleSource: 'MANUAL_WEEKLY' },
  });

  // ---------- Спортшкола (пока не опубликована) ----------
  await prisma.sportSchool.create({
    data: {
      name: 'СШОР «Юность»',
      address: 'ул. Красноармейская, 4',
      phone: '+7 (343) 200-00-00',
      ageNote: 'уточняйте',
      priceNote: 'уточняйте',
      isPublished: false,
    },
  });

  // ---------- Тренеры на разных статусах и у разных менеджеров ----------
  console.log('Создаю анкеты тренеров...');

  const elena = await prisma.coach.create({
    data: {
      fullName: 'Волкова Елена Сергеевна',
      phone: '+7 900 111-22-33',
      phoneNormalized: normalizePhone('+7 900 111-22-33'),
      sport: 'figure_skating',
      age: 32,
      experienceYears: 9,
      qualification: 'КМС, 1 разряд',
      about: 'Работаю с детьми от 4 лет и взрослыми с нуля.',
      ageGroups: ['3-6', '7-12', '13-17', '18+'],
      priceFrom: 1800,
      bookingMode: 'DIRECT_CONTACT',
      directContactPhone: '+7 900 111-22-33',
      directContactTelegram: '@elena_volkova_fk',
      directContactMax: 'max.ru/u/elena-volkova-demo',
      documentsVerified: true,
      createdById: managerAnya.id,
      status: 'VERIFIED',
      rating: 4.9,
      reviewsCount: 86,
      verifiedReviewsCount: 86,
      contactClicksCount: 47,
    },
  });

  // Демо-подписка для Елены — через настоящие Subscription/Payment, а не
  // напрямую через Coach.isPremium (см. lib/entitlement.js: это единственно
  // верный способ, иначе seed-данные разойдутся с тем, что увидит любой,
  // кто попробует отменить эту подписку через кабинет тренера).
  const elenaSub = await prisma.subscription.create({
    data: {
      coachId: elena.id,
      provider: 'mock',
      providerSubscriptionId: `mock_sub_${elena.id}`,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.payment.create({
    data: {
      subscriptionId: elenaSub.id,
      provider: 'mock',
      providerEventId: `evt_seed_${elenaSub.id}`,
      providerPaymentId: `mock_payment_${elenaSub.id}`,
      amountRub: 199,
      status: 'SUCCEEDED',
    },
  });
  await recomputeEntitlement(prisma, elenaSub.id);

  const darya = await prisma.coach.create({
    data: {
      fullName: 'Соколова Дарья',
      phone: '+7 900 222-33-44',
      phoneNormalized: normalizePhone('+7 900 222-33-44'),
      sport: 'figure_skating',
      age: 29,
      experienceYears: 14,
      priceFrom: 2500,
      bookingMode: 'FORM',
      documentsVerified: true,
      createdById: managerAnya.id,
      status: 'VERIFIED',
      rating: 5.0,
      reviewsCount: 142,
      verifiedReviewsCount: 142,
      contactClicksCount: 112,
    },
  });

  // Заведена менеджером Ирой — Аня НЕ должна её видеть в своём списке
  const maria = await prisma.coach.create({
    data: {
      fullName: 'Петрова Мария',
      phone: '+7 900 333-44-55',
      phoneNormalized: normalizePhone('+7 900 333-44-55'),
      sport: 'figure_skating',
      age: 27,
      experienceYears: 7,
      priceFrom: 1500,
      createdById: managerIra.id,
      status: 'PENDING_CONSENT', // ждёт, пока сама тренер подтвердит по claim-ссылке
      claimToken: 'test-claim-token-maria',
    },
  });

  // Черновик — только что записана по звонку, ещё заполняется
  await prisma.coach.create({
    data: {
      fullName: 'Игорь Смирнов',
      phone: '+7 900 555-66-77',
      phoneNormalized: normalizePhone('+7 900 555-66-77'),
      sport: 'hockey',
      hockeyStickType: 'WITH_STICK',
      createdById: managerIra.id,
      status: 'DRAFT',
    },
  });

  // Архивная — для проверки, что архивные не мешают дедупликации по телефону
  await prisma.coach.create({
    data: {
      fullName: 'Бывший Тренер',
      phone: '+7 900 999-99-99',
      phoneNormalized: normalizePhone('+7 900 999-99-99'),
      sport: 'figure_skating',
      createdById: managerAnya.id,
      status: 'ARCHIVED',
    },
  });

  await prisma.coachArena.createMany({
    data: [
      { coachId: elena.id, arenaId: arenaLuna.id },
      { coachId: elena.id, arenaId: arenaFakel.id },
      { coachId: darya.id, arenaId: arenaLuna.id },
    ],
  });

  // ---------- Таблица обзвона ----------
  console.log('Создаю записи обзвона и комментарии...');

  const callMaria = await prisma.callRecord.create({
    data: { coachId: maria.id, managerId: managerIra.id, status: 'IN_PROGRESS' },
  });
  await prisma.callComment.create({
    data: {
      callRecordId: callMaria.id,
      authorId: managerIra.id,
      text: 'Дозвонилась, тренер заинтересована, высылаю ссылку для заполнения анкеты.',
    },
  });
  await prisma.callComment.create({
    data: {
      callRecordId: callMaria.id,
      authorId: managerIra.id,
      text: 'Попросила перезвонить завтра после обеда — сейчас на тренировке.',
    },
  });

  // ---------- Отзывы + жалоба (для проверки очереди супер-админа) ----------
  console.log('Создаю отзывы и жалобу...');

  const review1 = await prisma.review.create({
    data: {
      coachId: elena.id,
      clientPhone: '+7 961 920-00-00',
      text: 'Дочка занимается уже полгода, очень довольны — тренер находит подход даже к капризным детям.',
      rating: 5,
      isVerified: true,
    },
  });
  const review2 = await prisma.review.create({
    data: {
      coachId: elena.id,
      clientPhone: '+7 961 920-11-11',
      text: 'Отвратительно! Даже не была на занятии, тренер нахамил моему ребёнку!',
      rating: 1,
      isVerified: true,
    },
  });
  await prisma.reviewComplaint.create({
    data: {
      reviewId: review2.id,
      reason: 'WRONG_COACH',
      comment: 'Тренер утверждает, что этот человек никогда не был её учеником — похоже, отзыв не тому профилю.',
    },
  });

  // ---------- Заявка на новый вид спорта ----------
  await prisma.sportRequest.create({
    data: {
      payload: {
        fullName: 'Смирнова Ольга',
        phone: '+7 900 444-55-66',
        sport: 'gymnastics',
        city: 'Екатеринбург',
        experienceYears: 6,
        price: 1200,
      },
    },
  });

  // ---------- Тестовые токены для ручной проверки ----------
  console.log('\n=== Готово! Тестовые JWT-токены для ручной проверки API ===\n');
  console.log('SUPER_ADMIN (Алёна) — готовый токен, ЭТО ОБХОД 2FA для удобства ручного');
  console.log('тестирования остальных admin-эндпоинтов, а не то, как реально логинится');
  console.log('супер-админ. Чтобы проверить настоящий флоу входа (email+пароль+SMS-код):');
  console.log(`  email: ${superAdmin.email}`);
  console.log(`  пароль: ${SUPER_ADMIN_DEV_PASSWORD}`);
  console.log('  POST /api/auth/admin/login -> получить challengeId');
  console.log('  код придёт в консоль сервера (мок SMS-провайдера)');
  console.log('  POST /api/auth/admin/verify-2fa -> получить настоящий токен');
  console.log('Готовый токен для быстрых проверок API:');
  console.log(signAdminToken(superAdmin));
  console.log('\nMANAGER (Аня — ведёт Елену и Дарью):');
  console.log(signAdminToken(managerAnya));
  console.log('\nMANAGER (Ира — ведёт Марию и Игоря):');
  console.log(signAdminToken(managerIra));
  console.log('\nCOACH (Елена Волкова — для проверки /api/me/*):');
  console.log(signCoachToken(elena));
  console.log('\nПодставляйте как заголовок: Authorization: Bearer <токен>\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
