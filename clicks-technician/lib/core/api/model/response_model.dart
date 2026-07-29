/// A generic response model class for API responses
///
/// \[T\] - The type of the data contained in the response
class ResponseModel<T> {
  /// Indicates whether the API request was successful
  final bool success;

  /// The data returned from the API request
  T? data;

  /// The error message, if any, returned from the API request
  String? error;

  /// Constructor for [ResponseModel]
  ///
  /// \[data\] - The data returned from the API request
  /// \[error\] - The error message, if any, returned from the API request
  /// \[success\] - Indicates whether the API request was successful
  ResponseModel._({this.data, this.error, required this.success});

  factory ResponseModel.success(T data) {
    return ResponseModel<T>._(data: data, success: true);
  }

  factory ResponseModel.error(String error) {
    return ResponseModel<T>._(error: error, success: false);
  }
}
