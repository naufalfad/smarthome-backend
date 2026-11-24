import { prisma } from './db.service.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  AppUserRole,
} from '../utils/auth-crypto.util.js';
import { AppError } from '../middlewares/error.middleware.js';

export interface CustomerProfileSummary {
  id: string;
  userId: string;
  fullName: string;
  phone: string | null;
  billingAddress: string | null;
  companyName: string | null;
  notes: string | null;
}

export interface TechnicianProfileSummary {
  id: string;
  userId: string;
  employeeCode: string | null;
  specialization: string | null;
  serviceArea: string | null;
  availabilityStatus: string;
}

export interface AuthUserResponse {
  id: string;
  username: string | null;
  email: string | null;
  name: string;
  phone: string | null;
  role: AppUserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  customerProfile: CustomerProfileSummary | null;
  technicianProfile: TechnicianProfileSummary | null;
  ownedHouseIds: string[];
  /**
   * Backward-compatibility convenience field: populated ONLY when a Customer owns
   * exactly 1 property via House.customerId (never silently picks first among many).
   */
  houseId: string | null;
  houseName?: string | null;
}

export interface LoginResult {
  token: string;
  user: AuthUserResponse;
}

export interface RegisterCustomerInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  // Explicitly typed only to detect & reject client-side tampering attempts
  role?: unknown;
  isActive?: unknown;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,25}$/;

// Constant-time dummy hash for timing-safe anti-enumeration when user is not found
const DUMMY_PASSWORD_HASH = hashPassword('anti-enumeration-dummy-secret-value');

const GENERIC_AUTH_FAILURE_MSG =
  'Kredensial tidak valid atau akun tidak aktif. Periksa kembali identitas dan kata sandi Anda.';

const USER_PROFILE_INCLUDE = {
  customerProfile: {
    include: {
      houses: {
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  technicianProfile: true,
};

function formatSafeUser(user: any): AuthUserResponse {
  const ownedHouses: Array<{ id: string; name: string }> =
    user.customerProfile?.houses || [];
  const ownedHouseIds = ownedHouses.map((h) => h.id);

  // Never silently pick first house when a Customer owns multiple properties
  const singleHouse = ownedHouses.length === 1 ? ownedHouses[0] : null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role as AppUserRole,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    customerProfile: user.customerProfile
      ? {
          id: user.customerProfile.id,
          userId: user.customerProfile.userId,
          fullName: user.customerProfile.fullName,
          phone: user.customerProfile.phone,
          billingAddress: user.customerProfile.billingAddress,
          companyName: user.customerProfile.companyName,
          notes: user.customerProfile.notes,
        }
      : null,
    technicianProfile: user.technicianProfile
      ? {
          id: user.technicianProfile.id,
          userId: user.technicianProfile.userId,
          employeeCode: user.technicianProfile.employeeCode,
          specialization: user.technicianProfile.specialization,
          serviceArea: user.technicianProfile.serviceArea,
          availabilityStatus: user.technicianProfile.availabilityStatus,
        }
      : null,
    ownedHouseIds,
    houseId: singleHouse?.id ?? null,
    houseName: singleHouse?.name ?? null,
  };
}

export class AuthService {
  /**
   * Unified login supporting:
   * - Email + password (Customer accounts and staff with email)
   * - Username + password (backward-compatible internal staff accounts)
   * Enforces isActive check, updates lastLoginAt, and returns uniform anti-enumeration errors.
   */
  static async login(identifierInput: string, passwordInput: string): Promise<LoginResult> {
    const rawIdentifier = typeof identifierInput === 'string' ? identifierInput.trim() : '';
    const password = typeof passwordInput === 'string' ? passwordInput : '';

    if (!rawIdentifier || !password) {
      throw new AppError('Identitas login dan kata sandi wajib diisi.', 401);
    }

    const normalized = rawIdentifier.toLowerCase();
    const isEmailIdentifier = normalized.includes('@');

    const user = isEmailIdentifier
      ? await prisma.user.findUnique({
          where: { email: normalized },
          include: USER_PROFILE_INCLUDE,
        })
      : await prisma.user.findUnique({
          where: { username: normalized },
          include: USER_PROFILE_INCLUDE,
        });

    if (!user) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      throw new AppError(GENERIC_AUTH_FAILURE_MSG, 401);
    }

    const isMatch = verifyPassword(password, user.password);
    if (!isMatch || !user.isActive) {
      throw new AppError(GENERIC_AUTH_FAILURE_MSG, 401);
    }

    const now = new Date();
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
      include: USER_PROFILE_INCLUDE,
    });

    const formatted = formatSafeUser(updatedUser);

    const token = generateToken({
      userId: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role as AppUserRole,
      customerProfileId: updatedUser.customerProfile?.id ?? null,
      technicianProfileId: updatedUser.technicianProfile?.id ?? null,
    });

    return {
      token,
      user: formatted,
    };
  }

  /**
   * Public Customer self-registration (Email + Password).
   * Atomically creates User (role = CUSTOMER) + 1:1 CustomerProfile inside a transaction.
   * Rejects any attempt to register as SUPER_ADMIN or TECHNICIAN.
   * Does NOT create House, Property, ServiceOrder, or TechnicianProfile.
   */
  static async registerCustomer(input: RegisterCustomerInput): Promise<LoginResult> {
    // 1. Explicitly reject role escalation attempts
    if (
      input.role !== undefined &&
      input.role !== null &&
      String(input.role).toUpperCase() !== 'CUSTOMER'
    ) {
      throw new AppError(
        'Pendaftaran publik hanya diperbolehkan untuk akun Customer.',
        403
      );
    }

    // 2. Validate Name
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      throw new AppError('Nama lengkap wajib diisi (2 hingga 100 karakter).', 400);
    }

    // 3. Validate & Normalize Email
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
      throw new AppError('Format alamat email tidak valid.', 400);
    }

    // 4. Enforce Password Strength Policy (min 8 chars, at least 1 letter & 1 number)
    const password = typeof input.password === 'string' ? input.password : '';
    if (password.length < 8 || password.length > 128) {
      throw new AppError('Kata sandi harus terdiri dari minimal 8 hingga 128 karakter.', 400);
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new AppError('Kata sandi harus mengandung kombinasi minimal satu huruf dan satu angka.', 400);
    }

    // 5. Validate optional Phone
    let phone: string | null = null;
    if (input.phone !== undefined && input.phone !== null && String(input.phone).trim() !== '') {
      const cleanedPhone = String(input.phone).trim();
      if (!PHONE_REGEX.test(cleanedPhone)) {
        throw new AppError('Format nomor telepon tidak valid (7–25 digit/karakter telepon).', 400);
      }
      phone = cleanedPhone;
    }

    // 6. Reject duplicate email cleanly
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        'Alamat email sudah terdaftar. Silakan masuk atau gunakan alamat email lain.',
        409
      );
    }

    // 7. Atomically create CUSTOMER User + 1:1 CustomerProfile (no House/Property created)
    const passwordHash = hashPassword(password);
    const now = new Date();

    const createdUser = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          name,
          email,
          phone,
          username: null,
          password: passwordHash,
          role: 'CUSTOMER', // Strictly server-enforced
          isActive: true,   // Strictly server-enforced
          lastLoginAt: now,
          houseId: null,
          customerProfile: {
            create: {
              fullName: name,
              phone,
            },
          },
        },
        include: USER_PROFILE_INCLUDE,
      });
    });

    const formatted = formatSafeUser(createdUser);

    const token = generateToken({
      userId: createdUser.id,
      username: createdUser.username,
      email: createdUser.email,
      role: 'CUSTOMER',
      customerProfileId: createdUser.customerProfile?.id ?? null,
      technicianProfileId: null,
    });

    return {
      token,
      user: formatted,
    };
  }

  /**
   * Retrieves live profile for authenticated active user (including CustomerProfile / TechnicianProfile)
   */
  static async getProfile(userId: string): Promise<AuthUserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_PROFILE_INCLUDE,
    });

    if (!user || !user.isActive) {
      throw new AppError('Pengguna tidak ditemukan atau akun tidak aktif.', 401);
    }

    return formatSafeUser(user);
  }
}
