import { db } from '../src/prisma/db';
import bcrypt from 'bcryptjs';

async function main() {
  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeThisNow!2026', 10);

  // Check if admin exists
  const existing = await db.orm.public.Usuario.where({ id: 'admin-seed-id' }).first();

  if (!existing) {
    await db.orm.public.Usuario.create({
      id: 'admin-seed-id',
      usuario: process.env.ADMIN_USER || 'admin_secure',
      nombre_completo: 'Administrador del Sistema',
      rol: 'ADMIN',
      password: hashedPassword,
    });
    console.log('Administrador seed creado exitosamente');
  } else {
    console.log('El administrador seed ya existe');
  }
}

main().catch(console.error).finally(() => process.exit(0));
