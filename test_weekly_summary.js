const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hybridofficetracker-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function testWeeklySummary() {
  const userId = 'iPhone_17_Pro_Max_1764234466966_kcm2cx7cb';
  
  console.log('📊 Testing Weekly Summary Notification...\n');
  
  const userSnapshot = await db.ref(`users/${userId}`).once('value');
  const userData = userSnapshot.val();
  
  if (!userData) {
    console.log('❌ User not found!');
    return;
  }
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Count office days this month
  const attendanceData = userData.attendanceData || {};
  let officeCount = 0;
  
  Object.keys(attendanceData).forEach(dateStr => {
    if (dateStr.startsWith(currentMonth)) {
      const attendance = attendanceData[dateStr];
      const status = typeof attendance === 'string' ? attendance : attendance?.status;
      if (status === 'office') officeCount++;
    }
  });
  
  // Calculate target
  const targetMode = userData.settings?.targetMode || 'percentage';
  const monthlyTarget = userData.settings?.monthlyTarget || 50;
  
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Count working days in month
  let workingDaysInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDaysInMonth++;
    }
  }
  
  // Count public holidays in current month (only weekdays)
  const cachedHolidays = userData.cachedHolidays || {};
  let publicHolidaysInMonth = 0;
  let holidayDates = [];
  Object.keys(cachedHolidays).forEach(dateStr => {
    if (dateStr.startsWith(currentMonth)) {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        publicHolidaysInMonth++;
        holidayDates.push(dateStr + ' - ' + cachedHolidays[dateStr]);
      }
    }
  });
  
  // Count approved leaves in current month (only weekdays)
  let approvedLeavesInMonth = 0;
  let leaveDates = [];
  Object.keys(attendanceData).forEach(dateStr => {
    if (dateStr.startsWith(currentMonth)) {
      const attendance = attendanceData[dateStr];
      const status = typeof attendance === 'string' ? attendance : attendance?.status;
      if (status === 'leave') {
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          approvedLeavesInMonth++;
          leaveDates.push(dateStr);
        }
      }
    }
  });
  
  // Adjust working days by subtracting holidays and leaves
  const adjustedWorkingDays = workingDaysInMonth - publicHolidaysInMonth - approvedLeavesInMonth;
  
  // Calculate required office days based on ADJUSTED working days
  let requiredOfficeDays;
  if (targetMode === 'percentage') {
    requiredOfficeDays = Math.ceil((monthlyTarget / 100) * adjustedWorkingDays);
  } else {
    requiredOfficeDays = monthlyTarget;
  }
  
  const daysRemaining = Math.max(0, requiredOfficeDays - officeCount);
  
  console.log('Current Month:', currentMonth);
  console.log('Target Mode:', targetMode);
  console.log('Monthly Target:', monthlyTarget + (targetMode === 'percentage' ? '%' : ' days'));
  console.log('\n📊 WORKING DAYS CALCULATION:');
  console.log('Working Days in Month:', workingDaysInMonth, '(Mon-Fri)');
  console.log('Public Holidays:', publicHolidaysInMonth, 'days');
  if (holidayDates.length > 0) {
    console.log('  →', holidayDates.join('\n  → '));
  }
  console.log('Approved Leaves:', approvedLeavesInMonth, 'days');
  if (leaveDates.length > 0) {
    console.log('  →', leaveDates.join(', '));
  }
  console.log('Adjusted Working Days:', adjustedWorkingDays, '(after holidays & leaves)');
  console.log('\n🎯 TARGET CALCULATION:');
  console.log('Required Office Days:', requiredOfficeDays, `(${monthlyTarget}% of ${adjustedWorkingDays})`);
  console.log('Office Days Completed:', officeCount);
  console.log('Days Remaining:', daysRemaining);
  console.log('\n📱 NOTIFICATION MESSAGE:');
  console.log('─'.repeat(80));
  
  let body;
  if (daysRemaining === 0) {
    body = `Great job! You've met your office target for this month (${officeCount} days). Keep it up! 🎉`;
  } else if (daysRemaining === 1) {
    body = `You need to come in 1 more day this month to meet your target. You've completed ${officeCount} days so far. 💪`;
  } else {
    body = `You need to come in ${daysRemaining} more days this month. You've completed ${officeCount} days so far. Let's do this! 🚀`;
  }
  
  console.log('Title: 📅 Monday Office Check');
  console.log('Body:', body);
  console.log('─'.repeat(80));
  
  // Send actual test notification
  console.log('\n📤 Sending test notification...');
  
  const message = {
    to: userData.fcmToken,
    sound: 'default',
    title: '📅 Test: Monday Office Check',
    body: body,
    data: {
      type: 'weekly_summary',
      day: 'Monday',
      officeCount: officeCount,
      daysRemaining: daysRemaining,
      action: 'open_stats'
    },
    priority: 'high',
  };
  
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    console.log('\n✅ Notification sent!');
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.data?.status === 'ok') {
      console.log('\n🎉 SUCCESS! Check your iPhone 17 Pro Max for the notification.');
    }
  } catch (error) {
    console.error('\n❌ Error sending notification:', error);
  }
  
  process.exit(0);
}

testWeeklySummary().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
