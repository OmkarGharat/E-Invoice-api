/**
 * Generic Filtering, Sorting, Pagination System
 * Extracted from server.js for modular reuse across routes.
 */

class GenericFilter {
  constructor(data) {
    this.data = data;
  }

  /**
   * Apply generic filters to any data array
   * @param {Array} data - The data to filter
   * @param {Object} filters - Filter parameters
   * @param {Object} fieldMapping - Map query params to actual fields
   * @returns {Array} Filtered data
   */
  apply(data, filters, fieldMapping = {}) {
    let filteredData = [...data];

    // Apply each filter dynamically
    Object.keys(filters).forEach(filterKey => {
      if (filterKey === 'page' || filterKey === 'limit' || filterKey === 'sortBy' || filterKey === 'sortOrder') {
        return; // Skip pagination/sorting params
      }

      const filterValue = filters[filterKey];
      if (filterValue === undefined || filterValue === '') {
        return;
      }

      // Map query param to actual field name
      const actualField = fieldMapping[filterKey] || filterKey;

      filteredData = this.applySingleFilter(filteredData, actualField, filterValue);
    });

    return filteredData;
  }

  /**
   * Apply a single filter dynamically
   */
  applySingleFilter(data, field, value) {
    return data.filter(item => {
      // Get the value from the item (support nested paths)
      const itemValue = this.getValueFromPath(item, field);

      // Handle special filter patterns
      if (typeof value === 'string') {
        // Multiple values (OR logic) - comma separated
        if (value.includes(',') && !value.startsWith('lt:') && !value.startsWith('gt:') && !value.startsWith('eq:') && !value.startsWith('ne:')) {
          const values = value.split(',').map(v => v.trim());
          return values.some(v => this.compareValues(itemValue, v));
        }

        // Range filters (lt:, gt:, eq:, ne:)
        if (value.startsWith('lt:')) {
          const numValue = parseFloat(value.substring(3));
          return typeof itemValue === 'number' && itemValue < numValue;
        }
        if (value.startsWith('gt:')) {
          const numValue = parseFloat(value.substring(3));
          return typeof itemValue === 'number' && itemValue > numValue;
        }
        if (value.startsWith('eq:')) {
          const compareValue = value.substring(3);
          return this.compareValues(itemValue, compareValue);
        }
        if (value.startsWith('ne:')) {
          const compareValue = value.substring(3);
          return !this.compareValues(itemValue, compareValue);
        }

        // Boolean filters
        if (value === 'true' || value === 'false') {
          const boolValue = value === 'true';
          return itemValue === boolValue;
        }

        // Date range (from:to)
        if (value.includes(':')) {
          const [dateFrom, dateTo] = value.split(':');
          if (dateFrom && dateTo) {
            const itemDate = new Date(itemValue);
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            return itemDate >= fromDate && itemDate <= toDate;
          }
        }

        // Text search (case-insensitive partial match)
        if (field === 'search') {
          return this.searchInItem(item, value);
        }
      }

      // Default: exact match (case-insensitive for strings)
      return this.compareValues(itemValue, value);
    });
  }

  /**
   * Get value from nested path (e.g., 'invoiceData.DocDtls.No')
   */
  getValueFromPath(item, path) {
    return path.split('.').reduce((obj, key) => obj && obj[key], item);
  }

  /**
   * Compare values with type conversion
   */
  compareValues(itemValue, filterValue) {
    // Handle numbers
    if (typeof itemValue === 'number' && !isNaN(filterValue)) {
      return itemValue === parseFloat(filterValue);
    }

    // Handle booleans
    if (typeof itemValue === 'boolean') {
      return itemValue === (filterValue === 'true');
    }

    // Handle strings (case-insensitive)
    if (typeof itemValue === 'string') {
      return itemValue.toLowerCase() === filterValue.toLowerCase();
    }

    // Default strict equality
    return itemValue == filterValue;
  }

  /**
   * Search across multiple fields in an item
   */
  searchInItem(item, searchTerm) {
    const term = searchTerm.toLowerCase();

    // Define searchable fields (can be customized)
    const searchableFields = [
      'irn',
      'invoiceData.DocDtls.No',
      'invoiceData.SellerDtls.LglNm',
      'invoiceData.BuyerDtls.LglNm',
      'invoiceData.SellerDtls.Gstin',
      'invoiceData.BuyerDtls.Gstin',
      'status'
    ];

    return searchableFields.some(field => {
      const value = this.getValueFromPath(item, field);
      return value && value.toString().toLowerCase().includes(term);
    });
  }

  /**
   * Sort data dynamically
   */
  sort(data, sortBy = 'generatedAt', sortOrder = 'desc') {
    const order = sortOrder === 'desc' ? -1 : 1;

    return [...data].sort((a, b) => {
      const aValue = this.getValueFromPath(a, sortBy);
      const bValue = this.getValueFromPath(b, sortBy);

      if (aValue < bValue) return -1 * order;
      if (aValue > bValue) return 1 * order;
      return 0;
    });
  }

  /**
   * Apply pagination
   */
  paginate(data, page = 1, limit = 10) {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = pageNum * limitNum;

    return {
      data: data.slice(startIndex, endIndex),
      total: data.length,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(data.length / limitNum),
      hasNext: endIndex < data.length,
      hasPrev: startIndex > 0
    };
  }
}

module.exports = GenericFilter;
