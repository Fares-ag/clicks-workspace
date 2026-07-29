import React, { useState } from "react";
import { Table, Button, Modal, Form, Input, Switch, Select, message, Popconfirm } from "antd";
import {
  useGetVehicleModelsQuery,
  useCreateVehicleModelMutation,
  useUpdateVehicleModelMutation,
  useDeleteVehicleModelMutation,
  useGetVehicleMakesQuery
} from "../../store/vehicleConfigApi";

function VehicleModels() {
  const [selectedMake, setSelectedMake] = useState(null);
  const { data: makesData } = useGetVehicleMakesQuery();
  const { data, isLoading, refetch } = useGetVehicleModelsQuery(selectedMake);
  const [createVehicleModel] = useCreateVehicleModelMutation();
  const [updateVehicleModel] = useUpdateVehicleModelMutation();
  const [deleteVehicleModel] = useDeleteVehicleModelMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form] = Form.useForm();

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await deleteVehicleModel(id).unwrap();
      message.success("Vehicle model deleted");
      refetch();
    } catch (err) {
      message.error(err?.data?.message || "Delete failed");
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateVehicleModel({ id: editing._id, ...values }).unwrap();
        message.success("Vehicle model updated");
      } else {
        await createVehicleModel(values).unwrap();
        message.success("Vehicle model created");
      }
      setModalOpen(false);
      refetch();
    } catch (err) {
      message.error(err?.data?.message || "Operation failed");
    }
  };

  const columns = [
    {
      title: "Make",
      dataIndex: "makeId",
      key: "makeId",
      render: (makeId) =>
        makesData?.makes.find((m) => m._id === makeId)?.makeName || "-"
    },
    { title: "Model Name", dataIndex: "modelName", key: "modelName" },
    {
      title: "Active",
      dataIndex: "isActive",
      key: "isActive",
      render: (val) => (val ? "Yes" : "No")
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <>
          <Button type="link" onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this model?"
            onConfirm={() => handleDelete(record._id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" danger>
              Delete
            </Button>
          </Popconfirm>
        </>
      )
    }
  ];

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ color: "#981F1F" }}>Vehicle Models</h2>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Make"
          allowClear
          style={{ width: 240 }}
          value={selectedMake}
          onChange={setSelectedMake}
        >
          {makesData?.makes.map((make) => (
            <Select.Option key={make._id} value={make._id}>
              {make.makeName}
            </Select.Option>
          ))}
        </Select>
        <Button type="primary" onClick={handleAdd} style={{ marginLeft: 16 }}>
          Add Model
        </Button>
      </div>
      <Table
        dataSource={data?.models || []}
        columns={columns}
        rowKey="_id"
        loading={isLoading}
        pagination={false}
      />
      <Modal
        open={modalOpen}
        title={editing ? "Edit Vehicle Model" : "Add Vehicle Model"}
        onCancel={() => setModalOpen(false)}
        onOk={handleOk}
        okText={editing ? "Update" : "Create"}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="makeId"
            label="Make"
            rules={[{ required: true, message: "Please select make" }]}
          >
            <Select placeholder="Select make">
              {makesData?.makes.map((make) => (
                <Select.Option key={make._id} value={make._id}>
                  {make.makeName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="modelName"
            label="Model Name"
            rules={[{ required: true, message: "Please enter model name" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="isActive"
            label="Active"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default VehicleModels;
