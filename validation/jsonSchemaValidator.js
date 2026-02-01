const INVOICE_SCHEMA = {
    type: "object",
    required: ["Version", "TranDtls", "DocDtls", "SellerDtls", "BuyerDtls", "ItemList", "ValDtls"],
    properties: {
        Version: { type: "string", enum: ["1.1"] },
        TranDtls: {
            type: "object",
            required: ["SupTyp", "RegRev"],
            properties: {
                SupTyp: { type: "string", enum: ["B2B", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"] },
                RegRev: { type: "string", enum: ["Y", "N"] }
            }
        },
        DocDtls: {
            type: "object",
            required: ["Typ", "No", "Dt"],
            properties: {
                Typ: { type: "string", enum: ["INV", "CRN", "DBN"] },
                No: { type: "string" },
                Dt: { type: "string" }
            }
        },
        SellerDtls: {
            type: "object",
            required: ["Gstin", "LglNm", "Stcd"],
            properties: {
                Gstin: { type: "string", pattern: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$" }, // Basic GSTIN regex
                LglNm: { type: "string" },
                Stcd: { type: "string" }
            }
        },
        BuyerDtls: {
            type: "object",
            required: ["Gstin", "LglNm", "Stcd", "Pos"],
            properties: {
                Gstin: { type: "string" },
                LglNm: { type: "string" },
                Stcd: { type: "string" },
                Pos: { type: "string" }
            }
        },
        ItemList: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            items: {
                type: "object",
                required: ["SlNo", "PrdDesc", "HsnCd", "Qty", "Unit", "UnitPrice", "TotAmt", "AssAmt", "GstRt", "IgstAmt", "CgstAmt", "SgstAmt", "TotItemVal"],
                properties: {
                    SlNo: { type: "string" },
                    PrdDesc: { type: "string" },
                    HsnCd: { type: "string" },
                    Qty: { type: "number" },
                    Unit: { type: "string" },
                    UnitPrice: { type: "number" },
                    TotAmt: { type: "number" },
                    AssAmt: { type: "number" },
                    GstRt: { type: "number" },
                    IgstAmt: { type: "number" },
                    CgstAmt: { type: "number" },
                    SgstAmt: { type: "number" },
                    TotItemVal: { type: "number" }
                }
            }
        },
        ValDtls: {
            type: "object",
            required: ["AssVal", "CgstVal", "SgstVal", "IgstVal", "TotInvVal"],
            properties: {
                AssVal: { type: "number" },
                CgstVal: { type: "number" },
                SgstVal: { type: "number" },
                IgstVal: { type: "number" },
                TotInvVal: { type: "number" }
            }
        }
    }
};

/**
 * Validates data against a JSON schema-like object
 * @param {Object} data - The data to validate
 * @param {Object} schema - The schema definition
 * @param {String} path - Current path for error messages
 * @returns {Array} List of error messages (empty if valid)
 */
function validateSchema(data, schema, path = 'root') {
    const errors = [];

    // 1. Check Type
    let type = Array.isArray(data) ? 'array' : typeof data;

    // XML Compatibility: Allow numbers as strings if they look numeric
    if (schema.type === 'number' && type === 'string' && !isNaN(parseFloat(data)) && isFinite(data)) {
        // Technically it's a string from XML, but semantically a number.
        // We temporarily treat it as valid type for this check.
        // Ideally we should convert it in the parser, but nativeType parser covers most cases.
        // However, if nativeType missed something (like large numbers or formatting), be lenient.
        // Actually, let's trust nativeType?
        // Wait, issue might be nativeType converted empty decimals to integers?
        // Or attributes handling?
    } else if (schema.type && type !== schema.type) {
        // Exception: numbers can be integers? (simplified here)
        if (schema.type === 'number' && typeof data === 'number') {
            // ok
        } else {
            return [`${path}: Expected type ${schema.type} but found ${type}`];
        }
    }

    // If not object or array, we are done checking structure, check values
    if (type !== 'object' && type !== 'array') {
        if (schema.enum && !schema.enum.includes(data)) {
            errors.push(`${path}: Value '${data}' is not in allowed enum: ${schema.enum.join(', ')}`);
        }
        if (schema.pattern && typeof data === 'string') {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(data)) {
                errors.push(`${path}: Value '${data}' does not match pattern ${schema.pattern}`);
            }
        }
        return errors;
    }

    // 2. Check Object Properties
    if (type === 'object' && schema.properties) {
        // Check Required
        if (schema.required) {
            schema.required.forEach(reqField => {
                if (!(reqField in data)) {
                    errors.push(`${path}: Missing required field '${reqField}'`);
                }
            });
        }

        // Recursively check known properties
        Object.keys(schema.properties).forEach(propKey => {
            if (data[propKey] !== undefined) {
                const propErrors = validateSchema(data[propKey], schema.properties[propKey], `${path}.${propKey}`);
                errors.push(...propErrors);
            }
        });
    }

    // 3. Check Array Items
    if (type === 'array') {
        if (schema.minItems && data.length < schema.minItems) {
            errors.push(`${path}: Array has ${data.length} items, minimum is ${schema.minItems}`);
        }
        if (schema.maxItems && data.length > schema.maxItems) {
            errors.push(`${path}: Array has ${data.length} items, maximum is ${schema.maxItems}`);
        }
        if (schema.items) {
            data.forEach((item, index) => {
                const itemErrors = validateSchema(item, schema.items, `${path}[${index}]`);
                errors.push(...itemErrors);
            });
        }
    }

    return errors;
}

module.exports = {
    INVOICE_SCHEMA,
    validateSchema
};
