/**
 * e-Invoice Regex Validation Patterns
 * Based on NIC e-Invoice Schema Documentation
 * 
 * These patterns are used for field-level validation across all
 * GET (query params) and POST (request body) endpoints.
 */

const PATTERNS = {
  // ==================== TranDtls ====================
  TaxSch: {
    regex: /^(GST)$/,
    pattern: '^(GST)$',
    message: 'TaxSch must be "GST"',
    length: { min: 3, max: 10 }
  },
  SupTyp: {
    regex: /^(B2B|SEZWP|SEZWOP|EXPWP|EXPWOP|DEXP)$/i,
    pattern: '(?i)^((B2B)|(SEZWP)|(SEZWOP)|(EXPWP)|(EXPWOP)|(DEXP))$',
    message: 'SupTyp must be one of: B2B, SEZWP, SEZWOP, EXPWP, EXPWOP, DEXP',
    length: { min: 3, max: 10 }
  },
  RegRev: {
    regex: /^[YN]$/,
    pattern: '^([Y|N]{1})$',
    message: 'RegRev must be "Y" or "N"',
    length: { min: 1, max: 1 }
  },
  EcmGstin: {
    regex: /^([0-9]{2}[0-9A-Z]{13})$/,
    pattern: '^([0-9]{2}[0-9A-Z]{13})$',
    message: 'EcmGstin must be a valid 15-character GSTIN (2 digits + 13 alphanumeric)',
    length: { min: 15, max: 15 }
  },
  IgstOnIntra: {
    regex: /^[YN]$/,
    pattern: '^([Y|N]{1})$',
    message: 'IgstOnIntra must be "Y" or "N"',
    length: { min: 1, max: 1 }
  },

  // ==================== DocDtls ====================
  DocTyp: {
    regex: /^(INV|CRN|DBN)$/i,
    pattern: '(?i)^((INV)|(CRN)|(DBN))$',
    message: 'Document type must be one of: INV, CRN, DBN',
    length: { min: 3, max: 10 }
  },
  DocNo: {
    regex: /^([a-zA-Z1-9]{1}[a-zA-Z0-9\/-]{0,15})$/,
    pattern: '^([a-zA-Z1-9]{1}[a-zA-Z0-9\\/-]{0,15})$',
    message: 'Document number must start with a letter or digit (1-9), followed by up to 15 alphanumeric/dash/slash characters. Length: 1-16',
    length: { min: 1, max: 16 }
  },
  DocDt: {
    regex: /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
    pattern: '^(0[1-9]|[12][0-9]|3[01])/(0[1-9]|1[0-2])/\\d{4}$',
    message: 'Document date must be in DD/MM/YYYY format',
    length: { min: 10, max: 10 }
  },

  // ==================== SellerDtls / BuyerDtls ====================
  Gstin: {
    regex: /^([0-9]{2}[0-9A-Z]{13})$/,
    pattern: '^([0-9]{2}[0-9A-Z]{13})$',
    message: 'GSTIN must be 15 characters: 2 digits followed by 13 alphanumeric characters',
    length: { min: 15, max: 15 }
  },
  // Buyer GSTIN can also be "URP" for export/unregistered
  BuyerGstin: {
    regex: /^(URP|[0-9]{2}[0-9A-Z]{13})$/,
    pattern: '^(URP|[0-9]{2}[0-9A-Z]{13})$',
    message: 'Buyer GSTIN must be 15 characters (2 digits + 13 alphanumeric) or "URP" for unregistered/export',
    length: { min: 3, max: 15 }
  },
  LglNm: {
    regex: /^.{3,100}$/,
    pattern: '^.{3,100}$',
    message: 'Legal name must be between 3 and 100 characters',
    length: { min: 3, max: 100 }
  },
  Addr1: {
    regex: /^.{1,100}$/,
    pattern: '^.{1,100}$',
    message: 'Address line 1 must be between 1 and 100 characters',
    length: { min: 1, max: 100 }
  },
  Loc: {
    regex: /^.{3,50}$/,
    pattern: '^.{3,50}$',
    message: 'Location must be between 3 and 50 characters',
    length: { min: 3, max: 50 }
  },
  Pin: {
    regex: /^[1-9][0-9]{5}$/,
    pattern: '^[1-9][0-9]{5}$',
    message: 'Pincode must be a 6-digit number between 100000 and 999999',
    range: { min: 100000, max: 999999 }
  },
  Stcd: {
    regex: /^([1-9]|[0-9]{2})$/,
    pattern: '^([1-9]|[0-9]{2})$',
    message: 'State code must be a 1-2 digit number',
    length: { min: 1, max: 2 }
  },
  Pos: {
    regex: /^([1-9]|[0-9]{2})$/,
    pattern: '^([1-9]|[0-9]{2})$',
    message: 'Place of supply must be a 1-2 digit state code',
    length: { min: 1, max: 2 }
  },

  // ==================== ItemList ====================
  SlNo: {
    regex: /^[0-9]{1,6}$/,
    pattern: '^[0-9]{1,6}$',
    message: 'Serial number must be a number (1-6 digits)',
    length: { min: 1, max: 6 }
  },
  IsServc: {
    regex: /^[YN]$/,
    pattern: '^([Y|N]{1})$',
    message: 'IsServc must be "Y" or "N"',
    length: { min: 1, max: 1 }
  },
  HsnCd: {
    regex: /^[0-9]{4,8}$/,
    pattern: '^[0-9]{4,8}$',
    message: 'HSN code must be 4 to 8 digits',
    length: { min: 4, max: 8 }
  }
};

/**
 * Validate a single value against a named pattern
 * @param {string} fieldName - The pattern key from PATTERNS
 * @param {*} value - The value to validate
 * @returns {{ valid: boolean, message: string|null }}
 */
function validateField(fieldName, value) {
  const patternDef = PATTERNS[fieldName];
  if (!patternDef) {
    return { valid: true, message: null }; // No pattern defined, skip
  }

  if (value === undefined || value === null || value === '') {
    return { valid: true, message: null }; // Empty values handled by required-field checks
  }

  const strValue = String(value);

  if (!patternDef.regex.test(strValue)) {
    return {
      valid: false,
      message: `${fieldName}: '${strValue}' is invalid. ${patternDef.message}`
    };
  }

  return { valid: true, message: null };
}

/**
 * Validate multiple fields at once
 * @param {Object} fieldMap - { fieldName: value, ... }
 * @returns {Array<string>} List of error messages (empty if all valid)
 */
function validateFields(fieldMap) {
  const errors = [];
  for (const [fieldName, value] of Object.entries(fieldMap)) {
    const result = validateField(fieldName, value);
    if (!result.valid) {
      errors.push(result.message);
    }
  }
  return errors;
}

/**
 * Validate a full e-Invoice payload against regex patterns
 * @param {Object} data - The e-Invoice JSON payload
 * @returns {Array<string>} List of regex validation errors
 */
function validateInvoiceRegex(data) {
  const errors = [];

  // --- TranDtls ---
  if (data.TranDtls) {
    const td = data.TranDtls;
    if (td.TaxSch !== undefined) {
      const r = validateField('TaxSch', td.TaxSch);
      if (!r.valid) errors.push(r.message);
    }
    if (td.SupTyp !== undefined) {
      const r = validateField('SupTyp', td.SupTyp);
      if (!r.valid) errors.push(r.message);
    }
    if (td.RegRev !== undefined) {
      const r = validateField('RegRev', td.RegRev);
      if (!r.valid) errors.push(r.message);
    }
    if (td.EcmGstin !== undefined) {
      const r = validateField('EcmGstin', td.EcmGstin);
      if (!r.valid) errors.push(r.message);
    }
    if (td.IgstOnIntra !== undefined) {
      const r = validateField('IgstOnIntra', td.IgstOnIntra);
      if (!r.valid) errors.push(r.message);
    }
  }

  // --- DocDtls ---
  if (data.DocDtls) {
    const dd = data.DocDtls;
    if (dd.Typ !== undefined) {
      const r = validateField('DocTyp', dd.Typ);
      if (!r.valid) errors.push(`DocDtls.Typ: ${r.message}`);
    }
    if (dd.No !== undefined) {
      const r = validateField('DocNo', dd.No);
      if (!r.valid) errors.push(`DocDtls.No: ${r.message}`);
    }
    if (dd.Dt !== undefined) {
      const r = validateField('DocDt', dd.Dt);
      if (!r.valid) errors.push(`DocDtls.Dt: ${r.message}`);
    }
  }

  // --- SellerDtls ---
  if (data.SellerDtls) {
    const sd = data.SellerDtls;
    if (sd.Gstin !== undefined) {
      const r = validateField('Gstin', sd.Gstin);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
    if (sd.LglNm !== undefined) {
      const r = validateField('LglNm', sd.LglNm);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
    if (sd.Addr1 !== undefined) {
      const r = validateField('Addr1', sd.Addr1);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
    if (sd.Loc !== undefined) {
      const r = validateField('Loc', sd.Loc);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
    if (sd.Pin !== undefined) {
      const r = validateField('Pin', sd.Pin);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
    if (sd.Stcd !== undefined) {
      const r = validateField('Stcd', sd.Stcd);
      if (!r.valid) errors.push(`SellerDtls.${r.message}`);
    }
  }

  // --- BuyerDtls ---
  if (data.BuyerDtls) {
    const bd = data.BuyerDtls;
    if (bd.Gstin !== undefined) {
      // Buyer can be "URP" for exports
      const r = validateField('BuyerGstin', bd.Gstin);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
    if (bd.LglNm !== undefined) {
      const r = validateField('LglNm', bd.LglNm);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
    if (bd.Pos !== undefined) {
      const r = validateField('Pos', bd.Pos);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
    if (bd.Addr1 !== undefined) {
      const r = validateField('Addr1', bd.Addr1);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
    if (bd.Loc !== undefined) {
      const r = validateField('Loc', bd.Loc);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
    if (bd.Stcd !== undefined) {
      const r = validateField('Stcd', bd.Stcd);
      if (!r.valid) errors.push(`BuyerDtls.${r.message}`);
    }
  }

  // --- ItemList ---
  if (data.ItemList && Array.isArray(data.ItemList)) {
    data.ItemList.forEach((item, index) => {
      const prefix = `ItemList[${index}]`;
      if (item.SlNo !== undefined) {
        const r = validateField('SlNo', item.SlNo);
        if (!r.valid) errors.push(`${prefix}.${r.message}`);
      }
      if (item.IsServc !== undefined) {
        const r = validateField('IsServc', item.IsServc);
        if (!r.valid) errors.push(`${prefix}.${r.message}`);
      }
      if (item.HsnCd !== undefined) {
        const r = validateField('HsnCd', item.HsnCd);
        if (!r.valid) errors.push(`${prefix}.${r.message}`);
      }
    });
  }

  return errors;
}

module.exports = {
  PATTERNS,
  validateField,
  validateFields,
  validateInvoiceRegex
};
