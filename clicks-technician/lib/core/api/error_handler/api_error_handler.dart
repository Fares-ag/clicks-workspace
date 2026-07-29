import '../model/response_model.dart';

/// A class for handling API errors
class ApiErrorHandler {
  /// Handles the error and returns a [ResponseModel] with the error message
  ///
  /// \[error\] - The error object to be handled
  ///
  /// Returns a [ResponseModel] indicating the failure and containing the error message
  static ResponseModel handleError(dynamic error) {
    return ResponseModel.error(error.toString());
  }
}
