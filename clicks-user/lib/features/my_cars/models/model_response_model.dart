class ModelResponseModel {
  String? sId;
  String? makeId;
  String? modelName;

  ModelResponseModel({this.sId, this.makeId, this.modelName});

  ModelResponseModel.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    makeId = json['makeId'];
    modelName = json['modelName'];
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': sId,
      'makeId': makeId,
      'modelName': modelName,
    };
  }
}
