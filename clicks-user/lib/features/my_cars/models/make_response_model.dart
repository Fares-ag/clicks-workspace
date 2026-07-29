class MakeResponseModel {
  String? sId;
  String? makeName;

  MakeResponseModel({this.sId, this.makeName});

  MakeResponseModel.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    makeName = json['makeName'];
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': sId,
      'makeName': makeName,
    };
  }
}
