const { pool } = require('../db/pool');
const AppError = require('../utils/AppError');

// §9: setelah rapor Finalized/Distributed, hanya Administrator yang boleh mengubah
// nilai/presensi kelas tsb. Guru & Wali Kelas ditolak.
async function assertClassNotLocked(classId, actorRole) {
  if (actorRole === 'admin') return; // admin selalu boleh menembus
  const { rows } = await pool.query(
    `SELECT status FROM report_cards WHERE class_id = $1 AND status <> 'Draft' LIMIT 1`,
    [classId]
  );
  if (rows.length) {
    throw AppError.forbidden(
      'Rapor kelas ini sudah difinalisasi. Hanya Administrator yang dapat mengubah data.'
    );
  }
}

module.exports = { assertClassNotLocked };
