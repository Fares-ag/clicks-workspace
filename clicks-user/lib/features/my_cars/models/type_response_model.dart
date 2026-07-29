class TypeResponseModel {
  String? sId;
  String? typeName;

  TypeResponseModel({this.sId, this.typeName});

  TypeResponseModel.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    typeName = json['typeName'];
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': sId,
      'typeName': typeName,
    };
  }
}
