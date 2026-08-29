import 'dotenv/config';
import { UserRole } from '@prisma/client';
import { prisma } from 'server/db';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run promote-admin -- <email>');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({ where: { email }, data: { role: UserRole.ADMIN } });
  console.log(`${email} is now ADMIN.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
