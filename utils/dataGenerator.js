class EInvoiceDataGenerator {
  constructor() {
    this.states = {
      '29': { name: 'Karnataka', capital: 'BANGALORE', pincodes: [560001, 560002, 560003, 560004] },
      '07': { name: 'Delhi', capital: 'NEW DELHI', pincodes: [110001, 110002, 110003, 110004] },
      '27': { name: 'Maharashtra', capital: 'MUMBAI', pincodes: [400001, 400002, 400003, 400004] },
      '33': { name: 'Tamil Nadu', capital: 'CHENNAI', pincodes: [600001, 600002, 600003, 600004] },
      '36': { name: 'Telangana', capital: 'HYDERABAD', pincodes: [500001, 500002, 500003, 500004] }
    };

    this.products = [
      { name: "Laptop Computer", hsn: "84713000", category: "Electronics", priceRange: [30000, 150000] },
      { name: "Mobile Phone", hsn: "85171210", category: "Electronics", priceRange: [8000, 80000] },
      { name: "Office Chair", hsn: "94013000", category: "Furniture", priceRange: [2000, 15000] }
    ];

    this.companies = ["Global", "National", "Premium", "Elite", "Standard"];
    this.industries = ["Electronics", "Textiles", "Automobiles", "Chemicals", "Metals"];
  }

  getTestSamples() {
    return {
      // Sample 1: B2B Intrastate (CGST + SGST)
      1: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "INV/2024/001", Dt: "01/01/2024" },
        SellerDtls: {
          Gstin: "29AABCT1332L1Z1", LglNm: "ABC Electronics Pvt Ltd", TrdNm: "ABC Electronics",
          Addr1: "Electronics City", Addr2: "Phase 1", Loc: "BANGALORE", Pin: 560100, Stcd: "29",
          Ph: "9876543210", Em: "sales@abcelectronics.com"
        },
        BuyerDtls: {
          Gstin: "29AWGPV7107B1Z1", LglNm: "XYZ Traders Bangalore", TrdNm: "XYZ Traders",
          Pos: "29", Addr1: "Commercial Street", Addr2: "Block A", Loc: "BANGALORE", Pin: 560001,
          Stcd: "29", Ph: "9876543211", Em: "purchase@xyztraders.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "N", PrdDesc: "Laptop Computer", HsnCd: "84713000",
          BchDtls: { Nm: "BATCH001" }, Qty: 5, Unit: "NOS", UnitPrice: 75000, TotAmt: 375000,
          AssAmt: 375000, GstRt: 18, IgstAmt: 0, CgstAmt: 33750, SgstAmt: 33750, TotItemVal: 442500
        }],
        ValDtls: { AssVal: 375000, CgstVal: 33750, SgstVal: 33750, IgstVal: 0, TotInvVal: 442500 }
      },

      // Sample 2: B2B Interstate (IGST)
      2: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "INV/2024/002", Dt: "15/01/2024" },
        SellerDtls: {
          Gstin: "27AABCU9603R1ZM", LglNm: "Mumbai Textiles Ltd", TrdNm: "Mumbai Textiles",
          Addr1: "Textile Market", Loc: "MUMBAI", Pin: 400001, Stcd: "27",
          Ph: "9876543212", Em: "info@mumbaitextiles.com"
        },
        BuyerDtls: {
          Gstin: "29AWGPV7107B1Z1", LglNm: "Bangalore Retailers", TrdNm: "Bangalore Retail",
          Pos: "29", Addr1: "MG Road", Loc: "BANGALORE", Pin: 560001, Stcd: "29",
          Ph: "9876543213", Em: "orders@bangaloreretail.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "N", PrdDesc: "Cotton Shirts", HsnCd: "62052000",
          BchDtls: { Nm: "BATCH002" }, Qty: 100, Unit: "NOS", UnitPrice: 800, TotAmt: 80000,
          AssAmt: 80000, GstRt: 12, IgstAmt: 9600, CgstAmt: 0, SgstAmt: 0, TotItemVal: 89600
        }],
        ValDtls: { AssVal: 80000, CgstVal: 0, SgstVal: 0, IgstVal: 9600, TotInvVal: 89600 }
      },

      // Sample 3: Export Invoice (Zero Tax)
      3: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "EXPWP", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "EXP/2024/001", Dt: "20/02/2024" },
        SellerDtls: {
          Gstin: "06AABCT1332L000", LglNm: "Export Goods India",
          Addr1: "Industrial Area", Loc: "GURGAON", Pin: 122001, Stcd: "06",
          Ph: "9876543214", Em: "export@exportgoods.com"
        },
        BuyerDtls: {
          Gstin: "URP", LglNm: "International Buyer Inc", Pos: "96",
          Addr1: "123 International Street", Loc: "SINGAPORE", Pin: 999999, Stcd: "96",
          Ph: "6561234567", Em: "buyer@international.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "N", PrdDesc: "Handicraft Items", HsnCd: "44219090",
          Qty: 500, Unit: "NOS", UnitPrice: 500, TotAmt: 250000, AssAmt: 250000,
          GstRt: 0, IgstAmt: 0, CgstAmt: 0, SgstAmt: 0, TotItemVal: 250000
        }],
        ValDtls: { AssVal: 250000, CgstVal: 0, SgstVal: 0, IgstVal: 0, TotInvVal: 250000 }
      },

      // Sample 4: SEZ Supply
      4: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "SEZWP", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "SEZ/2024/001", Dt: "10/03/2024" },
        SellerDtls: {
          Gstin: "27AABCU9603R1ZM", LglNm: "Domestic Supplier Ltd",
          Addr1: "Commercial Street", Loc: "MUMBAI", Pin: 400001, Stcd: "27",
          Ph: "9876543215", Em: "contact@domesticsupplier.com"
        },
        BuyerDtls: {
          Gstin: "27SEZ12345678901", LglNm: "SEZ Unit Mumbai", Pos: "96",
          Addr1: "SEZ Area", Loc: "MUMBAI", Pin: 400001, Stcd: "27",
          Ph: "9876543216", Em: "sez@sezunit.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "N", PrdDesc: "Electronic Components", HsnCd: "85429000",
          Qty: 1000, Unit: "NOS", UnitPrice: 100, TotAmt: 100000, AssAmt: 100000,
          GstRt: 18, IgstAmt: 18000, CgstAmt: 0, SgstAmt: 0, TotItemVal: 118000
        }],
        ValDtls: { AssVal: 100000, CgstVal: 0, SgstVal: 0, IgstVal: 18000, TotInvVal: 118000 }
      },

      // Sample 5: Reverse Charge
      5: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "Y", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "INV/2024/005", Dt: "25/03/2024" },
        SellerDtls: {
          Gstin: "29AABCT1332L000", LglNm: "Small Service Provider",
          Addr1: "Service Road", Loc: "BANGALORE", Pin: 560001, Stcd: "29",
          Ph: "9876543217", Em: "service@smallprovider.com"
        },
        BuyerDtls: {
          Gstin: "29AWGPV7107B1Z1", LglNm: "Large Manufacturing Co", Pos: "29",
          Addr1: "Industrial Area", Loc: "BANGALORE", Pin: 560001, Stcd: "29",
          Ph: "9876543218", Em: "accounts@manufacturing.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "Y", PrdDesc: "Consulting Services", HsnCd: "998599",
          Qty: 1, Unit: "NOS", UnitPrice: 50000, TotAmt: 50000, AssAmt: 50000,
          GstRt: 18, IgstAmt: 0, CgstAmt: 4500, SgstAmt: 4500, TotItemVal: 59000
        }],
        ValDtls: { AssVal: 50000, CgstVal: 4500, SgstVal: 4500, IgstVal: 0, TotInvVal: 59000 }
      },

      // Sample 6: Credit Note
      6: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "CRN", No: "CRN/2024/001", Dt: "30/03/2024" },
        SellerDtls: {
          Gstin: "29AABCT1332L000", LglNm: "Original Seller Ltd",
          Addr1: "Main Road", Loc: "BANGALORE", Pin: 560001, Stcd: "29",
          Ph: "9876543219", Em: "sales@originalseller.com"
        },
        BuyerDtls: {
          Gstin: "29AWGPV7107B1Z1", LglNm: "Original Buyer Corp", Pos: "29",
          Addr1: "Trade Center", Loc: "BANGALORE", Pin: 560001, Stcd: "29",
          Ph: "9876543220", Em: "purchase@buyercorp.com"
        },
        ItemList: [{
          SlNo: "1", IsServc: "N", PrdDesc: "Defective Laptop - Return", HsnCd: "84713000",
          Qty: 1, Unit: "NOS", UnitPrice: -75000, TotAmt: -75000, AssAmt: -75000,
          GstRt: 18, IgstAmt: 0, CgstAmt: -6750, SgstAmt: -6750, TotItemVal: -88500
        }],
        ValDtls: { AssVal: -75000, CgstVal: -6750, SgstVal: -6750, IgstVal: 0, TotInvVal: -88500 }
      },

      // Sample 7: Multiple Items
      7: {
        Version: "1.1",
        TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
        DocDtls: { Typ: "INV", No: "INV/2024/007", Dt: "05/04/2024" },
        SellerDtls: {
          Gstin: "33AABCT1332L000", LglNm: "Multi Product Traders",
          Addr1: "Trade Complex", Loc: "CHENNAI", Pin: 600001, Stcd: "33",
          Ph: "9876543221", Em: "info@multitraders.com"
        },
        BuyerDtls: {
          Gstin: "33AWGPV7107B1Z1", LglNm: "Retail Chain Stores", Pos: "33",
          Addr1: "Shopping Mall", Loc: "CHENNAI", Pin: 600001, Stcd: "33",
          Ph: "9876543222", Em: "orders@retailchain.com"
        },
        ItemList: [
          {
            SlNo: "1", IsServc: "N", PrdDesc: "Office Desk", HsnCd: "94033000",
            BchDtls: { Nm: "BATCH007A" }, Qty: 10, Unit: "NOS", UnitPrice: 8000, TotAmt: 80000,
            AssAmt: 80000, GstRt: 12, IgstAmt: 0, CgstAmt: 4800, SgstAmt: 4800, TotItemVal: 89600
          },
          {
            SlNo: "2", IsServc: "N", PrdDesc: "Office Chair", HsnCd: "94013000",
            BchDtls: { Nm: "BATCH007B" }, Qty: 20, Unit: "NOS", UnitPrice: 3000, TotAmt: 60000,
            AssAmt: 60000, GstRt: 12, IgstAmt: 0, CgstAmt: 3600, SgstAmt: 3600, TotItemVal: 67200
          },
          {
            SlNo: "3", IsServc: "N", PrdDesc: "LED Bulbs", HsnCd: "85395000",
            BchDtls: { Nm: "BATCH007C" }, Qty: 100, Unit: "NOS", UnitPrice: 200, TotAmt: 20000,
            AssAmt: 20000, GstRt: 18, IgstAmt: 0, CgstAmt: 1800, SgstAmt: 1800, TotItemVal: 23600
          }
        ],
        ValDtls: { AssVal: 160000, CgstVal: 10200, SgstVal: 10200, IgstVal: 0, TotInvVal: 180400 }
      }
    };
  }

  getSampleDescription(id) {
    const descriptions = {
      1: "B2B Intrastate (CGST + SGST)",
      2: "B2B Interstate (IGST)",
      3: "Export Invoice (Zero Tax)",
      4: "SEZ Supply",
      5: "Reverse Charge",
      6: "Credit Note",
      7: "Multiple Items"
    };
    return descriptions[id] || "Sample Invoice";
  }

  validateBasicInvoice(data) {
    const errors = [];
    if (!data.Version || data.Version !== "1.1") errors.push("Version must be 1.1");
    if (!data.DocDtls || !data.DocDtls.Typ) errors.push("Document type is required");
    if (!data.SellerDtls || !data.SellerDtls.Gstin) errors.push("Seller GSTIN is required");
    if (!data.BuyerDtls || !data.BuyerDtls.Gstin) errors.push("Buyer GSTIN is required");
    if (!data.ItemList || data.ItemList.length === 0) errors.push("At least one item is required");
    return errors;
  }

  // ADD THIS METHOD - generates multiple invoices
  generateMultipleInvoices(count) {
    const invoices = [];
    const supplyTypes = ["B2B", "EXPWP", "SEZWP"];

    for (let i = 0; i < count; i++) {
      const randomType = supplyTypes[Math.floor(Math.random() * supplyTypes.length)];
      invoices.push(this.generateInvoice(randomType));
    }
    return invoices;
  }

  // ALSO ADD THIS METHOD - generates specific scenario invoices
  generateScenario(scenario) {
    // Map scenario names to supply types
    const scenarioMap = {
      "b2b_interstate": "B2B",
      "b2b_intrastate": "B2B",
      "export": "EXPWP",
      "sez": "SEZWP",
      "reverse_charge": "B2B",
      "credit_note": "B2B"
    };

    const supplyType = scenarioMap[scenario] || "B2B";
    return this.generateInvoice(supplyType);
  }

  generateInvoice(supplyType = "B2B") {
    const states = Object.keys(this.states);
    const sellerState = states[Math.floor(Math.random() * states.length)];
    const buyerState = supplyType === "B2B" ? states[Math.floor(Math.random() * states.length)] : sellerState;

    const product = this.products[Math.floor(Math.random() * this.products.length)];
    const qty = Math.floor(Math.random() * 10) + 1;
    const price = Math.floor(Math.random() * (product.priceRange[1] - product.priceRange[0])) + product.priceRange[0];
    const total = qty * price;
    const taxRate = 18;
    const tax = (total * taxRate) / 100;

    return {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: supplyType, RegRev: "N", IgstOnIntra: "N" },
      DocDtls: { Typ: "INV", No: `INV/${new Date().getFullYear()}/${Math.floor(Math.random() * 1000) + 1}`, Dt: new Date().toLocaleDateString('en-GB') },
      SellerDtls: {
        Gstin: this.generateGSTIN(sellerState),
        LglNm: `${this.companies[Math.floor(Math.random() * this.companies.length)]} ${this.industries[Math.floor(Math.random() * this.industries.length)]} Pvt Ltd`,
        Addr1: "Address Line 1", Loc: this.states[sellerState].capital, Pin: this.states[sellerState].pincodes[0], Stcd: sellerState
      },
      BuyerDtls: {
        Gstin: supplyType === "EXPWP" ? "URP" : this.generateGSTIN(buyerState),
        LglNm: `${this.companies[Math.floor(Math.random() * this.companies.length)]} ${this.industries[Math.floor(Math.random() * this.industries.length)]} Ltd`,
        Pos: supplyType === "EXPWP" ? "96" : buyerState,
        Addr1: "Buyer Address", Loc: supplyType === "EXPWP" ? "PORT AREA" : this.states[buyerState].capital,
        Pin: supplyType === "EXPWP" ? 999999 : this.states[buyerState].pincodes[0], Stcd: supplyType === "EXPWP" ? "96" : buyerState
      },
      ItemList: [{
        SlNo: "1", IsServc: "N", PrdDesc: product.name, HsnCd: product.hsn,
        Qty: qty, Unit: "NOS", UnitPrice: price, TotAmt: total, AssAmt: total,
        GstRt: taxRate, IgstAmt: sellerState !== buyerState ? tax : 0,
        CgstAmt: sellerState === buyerState ? tax / 2 : 0, SgstAmt: sellerState === buyerState ? tax / 2 : 0,
        TotItemVal: total + tax
      }],
      ValDtls: {
        AssVal: total, CgstVal: sellerState === buyerState ? tax / 2 : 0,
        SgstVal: sellerState === buyerState ? tax / 2 : 0, IgstVal: sellerState !== buyerState ? tax : 0,
        TotInvVal: total + tax
      }
    };
  }

  generateGSTIN(stateCode) {
    return `${stateCode}${Math.random().toString(36).substring(2, 15).toUpperCase()}`.substring(0, 15);
  }
}

module.exports = EInvoiceDataGenerator;