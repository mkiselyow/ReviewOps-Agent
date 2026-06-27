/**
 * Survey tool facade. Permission checks live in the underlying service.
 */
export {
  createQuestionnaire,
  addQuestions,
  approveQuestionnaire,
  createSurveyAssignments,
  getAssignmentByToken,
  submitResponseByToken,
  getQuestionnaireResults,
} from "../services/surveyService";
