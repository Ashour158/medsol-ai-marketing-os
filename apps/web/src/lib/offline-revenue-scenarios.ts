/**
 * Pure, read-only conversion scenario arithmetic. The only metric authority is
 * MarketingPerformanceService's independently reviewed source observations.
 * These are hypothetical business assumptions, NOT measured revenue, causal
 * attribution, provider activity, financial posting or an approved forecast.
 */
export type RevenueScenarioInput={
 reviewedQualifiedLeads:string;
 sourceStatus:"REVIEWED_SOURCE_EVIDENCE";
 currency:string;
 assumedDealValueMajor:string;
 closeRateBasisPoints:number;
 marginBasisPoints:number;
};
export type RevenueScenario={
 name:"Downside"|"Base"|"Upside";
 closeRateBasisPoints:number;
 expectedWinsHundredths:string;
 illustrativeGrossRevenueMajor:string;
 illustrativeGrossContributionMajor:string;
};
function boundedDecimal(value:string,field:string,maxDigits:number):bigint{
 if(typeof value!=="string"||!new RegExp("^(0|[1-9][0-9]{0,"+(maxDigits-1)+"})$").test(value))
  throw Error(field+" requires a bounded nonnegative integer");
 return BigInt(value);
}
function basisPoints(value:number,name:string):number{
 if(!Number.isSafeInteger(value)||value<0||value>10000)
  throw Error(name+" must be between 0 and 10000 basis points");
 return value;
}
export function modelOfflineRevenueScenarios(input:RevenueScenarioInput):{
 currency:string;source:"REVIEWED_QUALIFIED_LEADS_ONLY";
 measuredRevenue:false;causalAttributionValidated:false;externalEffectsAuthorized:false;
 scenarios:RevenueScenario[];
}{
 if(input.sourceStatus!=="REVIEWED_SOURCE_EVIDENCE")
  throw Error("Reviewed-source performance is required for revenue scenarios");
 if(!/^[A-Z]{3}$/.test(input.currency))throw Error("Explicit ISO-style currency code required");
 const leads=boundedDecimal(input.reviewedQualifiedLeads,"Reviewed qualified leads",15);
 const value=boundedDecimal(input.assumedDealValueMajor,"Assumed deal value",12);
 const close=basisPoints(input.closeRateBasisPoints,"Close rate");
 const margin=basisPoints(input.marginBasisPoints,"Gross margin");
 const rates:Array<Pick<RevenueScenario,"name"|"closeRateBasisPoints">>=[
  {name:"Downside",closeRateBasisPoints:Math.floor(close/2)},
  {name:"Base",closeRateBasisPoints:close},
  {name:"Upside",closeRateBasisPoints:Math.min(10000,Math.floor(close*3/2))}
 ];
 const scenarios:RevenueScenario[]=rates.map(s=>{
  const rate=BigInt(s.closeRateBasisPoints);
  const wins=leads*rate;
  const revenue=(wins*value+5000n)/10000n;
  // Round once from the exact rational product; rounding illustrative revenue first
  // would inflate small-population contribution estimates (double rounding).
  const gross=(wins*value*BigInt(margin)+50000000n)/100000000n;
  return {
   ...s,
   expectedWinsHundredths:((wins*100n+5000n)/10000n).toString(),
   illustrativeGrossRevenueMajor:revenue.toString(),
   illustrativeGrossContributionMajor:gross.toString()
  };
 });
 return {currency:input.currency,source:"REVIEWED_QUALIFIED_LEADS_ONLY",
  measuredRevenue:false,causalAttributionValidated:false,
  externalEffectsAuthorized:false,scenarios};
}
