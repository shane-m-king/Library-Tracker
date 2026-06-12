// Validation for surrogate-key ids that arrive as route params (e.g. /:id).
//
// All our primary keys are BIGINT GENERATED ALWAYS AS IDENTITY, so a valid id is
// a positive integer no larger than a BIGINT can hold. A naive /^\d+$/ check
// passes any string of digits - including one too large for the column, which
// Postgres rejects at query time with error 22003 (numeric_value_out_of_range).
// That turns what should be a clean 404 ("no such id") into an unhandled 500.
// Bounding the magnitude here lets every route treat an out-of-range id as simply
// "not found", with no per-route error handling.

// Maximum value of a signed 8-byte Postgres BIGINT: 2^63 - 1.
const BIGINT_MAX = 9223372036854775807n;

// Is `value` a well-formed, in-range BIGINT id? Must be a plain string of digits
// (no sign, no decimal) within BIGINT range. We compare with BigInt rather than
// Number because ids past 2^53 lose precision as JS numbers. Leading zeros and
// "0" are accepted - they're harmless, and id 0 simply matches no row (-> 404).
export function isValidId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
  return BigInt(value) <= BIGINT_MAX;
}
