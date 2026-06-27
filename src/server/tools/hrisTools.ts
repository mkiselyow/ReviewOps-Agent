/**
 * HRIS tool facade. Agents read team/role/goal data only through these tools,
 * never the database directly (see docs/ARCHITECTURE_AND_SECURITY.md §6).
 */
export {
  getDirectReports,
  getEmployeeProfile,
  getEmployeeGoals,
  getRoleExpectations,
  getCompanyValues,
  getCompanyValueNames,
} from "../services/hrisService";
