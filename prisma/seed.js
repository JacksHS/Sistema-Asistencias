const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.usuario.upsert({
    where: {
      id: 'admin-seed-id', // Use a fixed ID or rely on something else if we want to find it by name, but we only have ID as unique. Let's create if it doesn't exist.
    },
    update: {},
    create: {
      id: 'admin-seed-id',
      nombre: 'Administrador Principal',
      rol: 'ADMIN',
      password: adminPassword,
    },
  });

  console.log('Seed ejecutado:', admin);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
