class ProfileResponseModel {
  String? id;
  String? phoneNumber;
  String? firstName;
  String? lastName;
  String? email;
  String? status;

  ProfileResponseModel({
    this.id,
    this.phoneNumber,
    this.firstName,
    this.lastName,
    this.email,
    this.status,
  });

  ProfileResponseModel.fromJson(Map<String, dynamic> json) {
    id = json['id'];
    phoneNumber = json['phone_number'];
    firstName = json['first_name'];
    lastName = json['last_name'];
    email = json['email'];
    status = json['status'];
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'phone_number': phoneNumber,
      'first_name': firstName,
      'last_name': lastName,
      'email': email,
      'status': status,
    };
  }
}
