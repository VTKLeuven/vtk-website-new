/**
 * De beheeracties, per domein in `app/actions/beheer/` (T1 uit de audit van
 * november 2026). Dit bestand geeft ze enkel door, zodat wie
 * `@/app/actions/beheer` importeert niets hoeft te weten van die indeling.
 * Zet hier geen code: een nieuwe actie hoort in het bestand van haar domein.
 */
export {
  saveCategoryAction,
  deactivateCategoryAction,
  saveItemAction,
  setItemQuantityAction,
  deactivateItemAction,
  activateItemAction,
} from './beheer/inventaris';
export {
  saveEventAction,
  linkToEventAction,
  deleteEventAction,
} from './beheer/evenementen';
export {
  saveTemplateFromReservationAction,
  saveTemplateAction,
  deleteTemplateAction,
} from './beheer/sjablonen';
export {
  approveReservationAction,
  rejectReservationAction,
  setLinePreparedAction,
  saveLineDecisionAction,
  markPickedUpAction,
  markReturnedAction,
  markPaidOfflineAction,
  markDepositReturnedAction,
  bulkMarkPickedUpAction,
  bulkMarkReturnedAction,
} from './beheer/aanvragen';
export {
  reopenReservationAction,
  undoPickedUpAction,
  undoReturnedAction,
  undoPaidOfflineAction,
  undoDepositReturnedAction,
  adminEditFlesserkeReservationAction,
  previewShiftAction,
  shiftReservationDatesAction,
  adminEditReservationAction,
} from './beheer/terugdraaien';
export {
  createTransportForReservationAction,
  approveTransportAction,
  rejectTransportAction,
  deleteTransportAction,
  adminCreateTransportAction,
  previewTripSeriesAction,
  deleteTripSeriesFromAction,
  adminEditTransportAction,
  assignDriverAction,
  assignTripGroupAction,
  changeVehicleAction,
  completeTransportAction,
  markTransportPaidOfflineAction,
  reopenTransportAction,
  undoCompleteTransportAction,
  undoTransportPaidOfflineAction,
} from './beheer/vervoer';
export {
  searchDriverCandidatesAction,
  addDriverAction,
  addDriverFromGroupAction,
  saveDriverNoteAction,
  saveDriverPhoneAction,
  importDriverPhonesAction,
  setDriverVanAction,
  setDriverColorAction,
  setDriverCustomColorAction,
  removeDriverAction,
} from './beheer/chauffeurs';
export {
  saveVehicleAction,
  setVehicleActiveAction,
  saveLogistiekSettingsAction,
  setBezettingOpensPlanningAction,
} from './beheer/instellingen';
export {
  createFeedTokenAction,
  revokeFeedTokenAction,
} from './beheer/agendafeed';
export {
  saveFlesserkeCategoryAction,
  saveFlesserkeItemAction,
  saveFlesserkeBatchAction,
  deleteFlesserkeBatchAction,
  setFlesserkeItemActiveAction,
  deactivateFlesserkeCategoryAction,
} from './beheer/flesserke';
export type { BulkActionResult } from './beheer/aanvragen';
