// Script to generate exactly 643 users with realistic names and relevant emails (Gmail, Yahoo, AOL, etc.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Melissa', 'George', 'Deborah', 'Edward', 'Stephanie',
  'Ronald', 'Rebecca', 'Timothy', 'Sharon', 'Jason', 'Laura', 'Jeffrey', 'Cynthia', 'Ryan', 'Kathleen',
  'Jacob', 'Amy', 'Gary', 'Angela', 'Nicholas', 'Shirley', 'Eric', 'Anna', 'Jonathan', 'Brenda',
  'Stephen', 'Pamela', 'Larry', 'Nicole', 'Justin', 'Emma', 'Scott', 'Samantha', 'Brandon', 'Katherine',
  'Benjamin', 'Christine', 'Samuel', 'Helen', 'Gregory', 'Debra', 'Alexander', 'Rachel', 'Frank', 'Carolyn',
  'Patrick', 'Janet', 'Raymond', 'Maria', 'Jack', 'Catherine', 'Dennis', 'Heather', 'Jerry', 'Diane',
  'Tyler', 'Olivia', 'Aaron', 'Julie', 'Jose', 'Joyce', 'Adam', 'Victoria', 'Nathan', 'Kelly',
  'Henry', 'Christina', 'Douglas', 'Lauren', 'Zachary', 'Joan', 'Peter', 'Evelyn', 'Kyle', 'Judith',
  'Walter', 'Megan', 'Ethan', 'Cheryl', 'Jeremy', 'Andrea', 'Harold', 'Hannah', 'Keith', 'Martha',
  'Christian', 'Jacqueline', 'Roger', 'Frances', 'Noah', 'Gloria', 'Gerald', 'Ann', 'Carl', 'Teresa',
  'Terry', 'Kathryn', 'Sean', 'Sara', 'Austin', 'Janice', 'Arthur', 'Jean', 'Lawrence', 'Alice',
  'Jesse', 'Madison', 'Dylan', 'Doris', 'Bryan', 'Abigail', 'Joe', 'Julia', 'Jordan', 'Judy',
  'Billy', 'Grace', 'Bruce', 'Denise', 'Albert', 'Amber', 'Willie', 'Marilyn', 'Gabriel', 'Beverly',
  'Logan', 'Danielle', 'Alan', 'Theresa', 'Juan', 'Sophia', 'Wayne', 'Marie', 'Roy', 'Diana',
  'Ralph', 'Brittany', 'Randy', 'Natalie', 'Eugene', 'Isabella', 'Vincent', 'Charlotte', 'Russell', 'Harper',
  'Elijah', 'Amelia', 'Louis', 'Ella', 'Bobby', 'Chloe', 'Philip', 'Penelope', 'Johnny', 'Camila',
  'Elena', 'Marcus', 'Liam', 'Lucas', 'Leo', 'Zoe', 'Max', 'Maya', 'Kai',
  'Finn', 'Aria', 'Cole', 'Nina', 'Ezra', 'Mila', 'Jax', 'Nora', 'Hugo', 'Ian',
  'Dean', 'Troy', 'Reid', 'Seth', 'Vance', 'Drake', 'Knox', 'Brody', 'Shane', 'Miles',
  'Trevor', 'Victor', 'Colton', 'Derek', 'Spencer', 'Blake', 'Grant', 'Garrett', 'Travis', 'Dustin'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
  'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
  'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper',
  'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
  'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
  'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez',
  'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes',
  'Gonzales', 'Fisher', 'Vasquez', 'Simmons', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham',
  'Reynolds', 'Griffin', 'Wallace', 'Moreno', 'West', 'Cole', 'Hayes', 'Bryant', 'Herrera', 'Gibson',
  'Ellis', 'Tran', 'Medina', 'Aguilar', 'Stevens', 'Murray', 'Ford', 'Castro', 'Marshall', 'Owens',
  'Harrison', 'Fernandez', 'Mcdonald', 'Woods', 'Washington', 'Kennedy', 'Wells', 'Vargas', 'Henry', 'Chen',
  'Freeman', 'Webb', 'Tucker', 'Guzman', 'Burns', 'Crawford', 'Olson', 'Simpson', 'Porter', 'Hunter',
  'Gordon', 'Mendez', 'Silva', 'Shaw', 'Snyder', 'Mason', 'Dixon', 'Munoz', 'Hunt', 'Hicks',
  'Holmes', 'Palmer', 'Wagner', 'Black', 'Robertson', 'Boyd', 'Rose', 'Stone', 'Salazar', 'Fox',
  'Warren', 'Mills', 'Meyer', 'Rice', 'Schmidt', 'Garza', 'Daniels', 'Ferguson', 'Nichols', 'Stephens',
  'Soto', 'Weaver', 'Ryan', 'Gardner', 'Payne', 'Grant', 'Dunn', 'Kelley', 'Spencer', 'Hawkins',
  'Arnold', 'Pierce', 'Vazquez', 'Hansen', 'Peters', 'Santos', 'Hart', 'Bradley', 'Knight', 'Elliott',
  'Vance', 'Brody', 'Rostova', 'Sinclair', 'Thorne', 'Mercer', 'Adler', 'Richter', 'Tanaka', 'Hayashi',
  'O\'Connor', 'Gallagher', 'Novak', 'Fischer', 'Weber', 'Schmidt', 'Becker', 'Hoffman', 'Meyer', 'Wagner'
];

const DOMAINS = [
  // High volume of Gmail, Yahoo, AOL as requested
  'gmail.com', 'gmail.com', 'gmail.com', 'gmail.com', 'gmail.com', // ~50%
  'yahoo.com', 'yahoo.com', 'yahoo.com', // ~25%
  'aol.com', 'aol.com', // ~15%
  'outlook.com', 'hotmail.com', // ~7%
  'icloud.com' // ~3%
];

const SUFFIX_KEYWORDS = [
  '', '', '', '', '', '', '', // empty most of the time
  'domains', 'invest', 'capital', 'holdings', 'ventures', 'broker', 'web', 'tech', 'online', 'assets', 'pro', 'media'
];

function cleanString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function generateUsers(targetCount = 643) {
  const users = [];
  const usedNames = new Set();
  const usedEmails = new Set();

  let seed = 4287913;
  function random() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function pick(arr) {
    return arr[Math.floor(random() * arr.length)];
  }

  const now = new Date('2026-10-18T18:00:00.000Z').getTime();
  const startTime = new Date('2026-01-10T08:00:00.000Z').getTime();
  const endTime = now - 1000 * 60 * 30; // 30 minutes ago

  let idCounter = 1;

  for (let i = 0; i < targetCount; i++) {
    // Generate unique name
    let firstName, lastName, fullName;
    let attempts = 0;
    do {
      firstName = pick(FIRST_NAMES);
      lastName = pick(LAST_NAMES);
      fullName = `${firstName} ${lastName}`;
      attempts++;
    } while (usedNames.has(fullName) && attempts < 2000);
    usedNames.add(fullName);

    const fClean = cleanString(firstName);
    const lClean = cleanString(lastName);

    // Generate relevant email matching their name
    let email;
    let emailAttempts = 0;
    do {
      const emailDomain = pick(DOMAINS);
      const patternChoice = Math.floor(random() * 8);
      const num = Math.floor(random() * 90) + 10; // 10-99
      const year = Math.floor(random() * 30) + 70; // 70-99
      const keyword = pick(SUFFIX_KEYWORDS);

      let localPart = '';
      switch (patternChoice) {
        case 0:
          localPart = `${fClean}.${lClean}${random() > 0.4 ? num : ''}`;
          break;
        case 1:
          localPart = `${fClean}${lClean}${random() > 0.5 ? num : ''}`;
          break;
        case 2:
          localPart = `${fClean[0]}${lClean}${random() > 0.4 ? num : ''}`;
          break;
        case 3:
          localPart = `${fClean}_${lClean}${random() > 0.5 ? num : ''}`;
          break;
        case 4:
          localPart = `${lClean}.${fClean}${random() > 0.6 ? num : ''}`;
          break;
        case 5:
          if (keyword) {
            localPart = random() > 0.5 ? `${fClean}.${lClean}.${keyword}` : `${fClean[0]}${lClean}_${keyword}`;
          } else {
            localPart = `${fClean}.${lClean[0]}${num}`;
          }
          break;
        case 6:
          localPart = `${fClean[0]}_${lClean}${random() > 0.5 ? num : ''}`;
          break;
        default:
          localPart = `${fClean}${lClean}${year}`;
          break;
      }

      email = `${localPart}@${emailDomain}`;
      emailAttempts++;
    } while (usedEmails.has(email) && emailAttempts < 500);

    if (usedEmails.has(email)) {
      email = `${fClean}.${lClean}${idCounter}@${pick(DOMAINS)}`;
    }
    usedEmails.add(email);

    // Plan distribution: ~62% free, ~26% pro, ~12% enterprise
    const planRoll = random();
    let plan = 'free';
    if (planRoll > 0.88) {
      plan = 'enterprise';
    } else if (planRoll > 0.62) {
      plan = 'pro';
    }

    // Created At timestamp
    const progress = Math.pow(random(), 0.85); // slight skew towards recent
    const createdTimestamp = Math.floor(startTime + progress * (endTime - startTime));
    const createdAt = new Date(createdTimestamp).toISOString();

    // Verification (~81% verified)
    const isVerified = random() < 0.81;
    let verifiedAt = null;
    if (isVerified) {
      const verifyDelta = Math.floor(random() * 3600000 * 18); // 0 to 18 hours after signup
      const verifyTime = Math.min(createdTimestamp + verifyDelta, now - 60000);
      verifiedAt = new Date(verifyTime).toISOString();
    }

    // Watchlist count (0 to 45)
    let watchlistCount = 0;
    if (plan === 'enterprise') {
      watchlistCount = Math.floor(random() * 35) + 10;
    } else if (plan === 'pro') {
      watchlistCount = Math.floor(random() * 20) + 3;
    } else {
      watchlistCount = Math.floor(random() * 8);
    }

    // Valuations count (1 to 240)
    let valuationsCount = 1;
    if (plan === 'enterprise') {
      valuationsCount = Math.floor(random() * 160) + 60;
    } else if (plan === 'pro') {
      valuationsCount = Math.floor(random() * 80) + 15;
    } else {
      valuationsCount = Math.floor(random() * 22) + 1;
    }

    users.push({
      id: idCounter++,
      name: fullName,
      email,
      plan,
      email_verified_at: verifiedAt,
      created_at: createdAt,
      watchlistCount,
      valuationsCount,
    });
  }

  // Sort by created_at DESC (newest first)
  users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Assign sequential IDs from 643 down to 1 (newest is #643, oldest is #1)
  users.forEach((u, idx) => {
    u.id = targetCount - idx;
  });

  return users;
}

const users = generateUsers(643);
console.log(`Generated ${users.length} users successfully.`);

const gmailCount = users.filter(u => u.email.endsWith('@gmail.com')).length;
const yahooCount = users.filter(u => u.email.endsWith('@yahoo.com')).length;
const aolCount = users.filter(u => u.email.endsWith('@aol.com')).length;
const outlookCount = users.filter(u => u.email.endsWith('@outlook.com') || u.email.endsWith('@hotmail.com')).length;
const otherCount = users.length - gmailCount - yahooCount - aolCount - outlookCount;

console.log(`Email distribution:`);
console.log(`- Gmail: ${gmailCount} (${((gmailCount/users.length)*100).toFixed(1)}%)`);
console.log(`- Yahoo: ${yahooCount} (${((yahooCount/users.length)*100).toFixed(1)}%)`);
console.log(`- AOL: ${aolCount} (${((aolCount/users.length)*100).toFixed(1)}%)`);
console.log(`- Outlook/Hotmail: ${outlookCount} (${((outlookCount/users.length)*100).toFixed(1)}%)`);
console.log(`- Other (iCloud): ${otherCount} (${((otherCount/users.length)*100).toFixed(1)}%)`);

const fileContent = `import type { AdminUser } from './admin-data';

/**
 * 643 Registered Users Dataset with Realistic Names and Relevant Webmail Accounts (Gmail, Yahoo, AOL, etc.)
 */
export const SEED_USERS: AdminUser[] = ${JSON.stringify(users, null, 2)};
`;

const outputPath = path.join(__dirname, '..', 'src', 'lib', 'seed-users.ts');
fs.writeFileSync(outputPath, fileContent, 'utf8');
console.log(`Wrote ${users.length} users to ${outputPath}`);
